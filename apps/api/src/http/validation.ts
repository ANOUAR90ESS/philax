import { AppError } from '@philax/types';
import type { z } from 'zod';

/** Parses untrusted input with a Zod schema, mapping failures to VALIDATION_FAILED. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', 'The request is invalid.', {
      details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
