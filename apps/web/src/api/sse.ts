import { ApiErrorSchema, type DebateStreamEvent, type ErrorCode } from '@philax/types';
import { API_URL, ApiClientError } from './client';

/** Parses one SSE frame ("event: x\ndata: {...}") into its data payload. */
export function parseSseFrame(frame: string): string | null {
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return data.length ? data.join('\n') : null;
}

/**
 * POSTs to an SSE endpoint and invokes `onEvent` for each event. Uses fetch
 * (not EventSource) because the endpoints are POST and need credentials.
 */
export async function streamEvents(
  path: string,
  body: unknown,
  onEvent: (event: DebateStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiClientError('NETWORK', 'Network error', 0, null);
  }
  if (!res.ok || !res.body) {
    const json: unknown = await res.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiClientError(e.code as ErrorCode, e.message, res.status, e.errorId);
    }
    throw new ApiClientError('INTERNAL', 'Unexpected error', res.status, null);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = parseSseFrame(frame);
      if (data) onEvent(JSON.parse(data) as DebateStreamEvent);
    }
  }
}
