import { LLMError, classifyHttpStatus } from '../types';

/** POSTs JSON and maps transport/HTTP failures to LLMError. Never logs bodies or keys. */
export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'AbortError' || name === 'TimeoutError')
      throw new LLMError('timeout', provider, 'Request timed out', null, err);
    throw new LLMError('network', provider, 'Network error', null, err);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new LLMError(
      classifyHttpStatus(res.status),
      provider,
      `${provider} API error ${res.status}`,
      res.status,
    );
  }
  return res;
}

/** Yields the `data:` payload of each server-sent event in a response body. */
export async function* readSseData(res: Response): AsyncIterable<string> {
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  }
}
