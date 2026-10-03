import { isAppError, type DebateStreamEvent } from '@philax/types';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Turns the reply into a Server-Sent Events stream. Validation and authorization
 * must happen before calling this (errors before streaming are normal JSON
 * errors); errors during streaming become `error` events with an error id.
 */
export async function streamSse(
  request: FastifyRequest,
  reply: FastifyReply,
  run: (emit: (e: DebateStreamEvent) => void, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const controller = new AbortController();
  request.raw.on('close', () => controller.abort());
  reply.hijack();
  const headers = reply.getHeaders();
  reply.raw.writeHead(200, {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])),
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const emit = (e: DebateStreamEvent) => {
    if (!reply.raw.writableEnded)
      reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) reply.raw.write(': keep-alive\n\n');
  }, 15_000);
  try {
    await run(emit, controller.signal);
  } catch (err) {
    const errorId = request.id;
    if (isAppError(err) && err.status < 500) {
      request.log.info({ code: err.code, errorId }, 'stream rejected');
      emit({ type: 'error', code: err.code, message: err.message, errorId });
    } else {
      request.log.error({ err, errorId }, 'stream failed');
      const code = isAppError(err)
        ? err.code
        : (err as { name?: string }).name === 'LLMError'
          ? 'AI_UNAVAILABLE'
          : 'INTERNAL';
      const message = isAppError(err)
        ? err.message
        : code === 'AI_UNAVAILABLE'
          ? 'The AI service is unavailable right now. Please try again shortly.'
          : 'Something went wrong on our side. Please try again.';
      emit({ type: 'error', code, message, errorId });
    }
  } finally {
    clearInterval(heartbeat);
    reply.raw.end();
  }
}
