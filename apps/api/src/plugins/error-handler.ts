import { isAppError, type ApiError } from '@philax/types';
import type { FastifyError, FastifyInstance } from 'fastify';

/**
 * Maps every error to `{ error: { code, message, errorId } }`. Users never see raw
 * 500s or stack traces; `errorId` (the request id) correlates with server logs.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const errorId = request.id;
    if (isAppError(err)) {
      if (err.status >= 500) request.log.error({ err, errorId }, 'request failed');
      else request.log.info({ code: err.code, errorId }, 'request rejected');
      const body: ApiError = {
        error: {
          code: err.code,
          message: err.message,
          errorId,
          ...(err.details ? { details: err.details } : {}),
        },
      };
      return reply.status(err.status).send(body);
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', errorId },
      } satisfies ApiError);
    }
    if (
      err.validation ||
      err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      err.statusCode === 400
    ) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'The request is invalid.', errorId },
      } satisfies ApiError);
    }
    if (err.statusCode === 413) {
      return reply.status(413).send({
        error: { code: 'VALIDATION_FAILED', message: 'The request is too large.', errorId },
      } satisfies ApiError);
    }
    request.log.error({ err, errorId }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Please try again.',
        errorId,
      },
    } satisfies ApiError);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Not found.', errorId: request.id },
    } satisfies ApiError);
  });
}
