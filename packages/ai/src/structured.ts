import { AppError } from '@philax/types';
import type { z } from 'zod';
import { extractJsonObject, extractPartialStringField } from './json';
import type { LLMGateway, LLMRequest, LLMResponse } from './types';

export interface StructuredResult<T> {
  data: T;
  response: LLMResponse;
  repaired: boolean;
}

export interface StructuredOptions {
  /** Stream the given string field's partial value to `onField` as it is generated. */
  streamField?: { name: string; onField: (fullValueSoFar: string) => void };
  /** Extra validation after the schema passes; return an error message to trigger repair. */
  refine?: (data: unknown) => string | null;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

/**
 * JSON generation with validation (§18): generate → parse → Zod validate →
 * one repair attempt carrying the validation errors → validate again. Invalid
 * data never reaches the next pipeline stage.
 */
export async function generateStructured<S extends z.ZodType>(
  gateway: LLMGateway,
  request: LLMRequest,
  schema: S,
  options: StructuredOptions = {},
): Promise<StructuredResult<z.infer<S>>> {
  const req: LLMRequest = { ...request, json: true };
  const first = await callOnce(gateway, req, options);
  const firstCheck = validate(schema, first.text, options);
  if (firstCheck.ok) {
    gateway.recordValidation(req, first, 'valid');
    return { data: firstCheck.data, response: first, repaired: false };
  }
  gateway.recordValidation(req, first, 'invalid');

  const repairReq: LLMRequest = {
    ...req,
    operation: `${req.operation}.repair`,
    messages: [
      ...req.messages,
      { role: 'assistant', content: first.text.slice(0, 20_000) || '(empty response)' },
      {
        role: 'user',
        content:
          'Your previous response was not valid for the required JSON schema. Problems:\n' +
          firstCheck.problems +
          '\nReturn ONLY the corrected JSON object, with no commentary.',
      },
    ],
  };
  const second = await callOnce(gateway, repairReq, options);
  const secondCheck = validate(schema, second.text, options);
  if (secondCheck.ok) {
    gateway.recordValidation(repairReq, second, 'repaired');
    return { data: secondCheck.data, response: second, repaired: true };
  }
  gateway.recordValidation(repairReq, second, 'invalid');
  throw new AppError('AI_OUTPUT_INVALID', 'The AI produced an invalid result.', {
    cause: new Error(
      `Structured output for ${req.operation} failed validation:\n${secondCheck.problems}`,
    ),
  });
}

async function callOnce(
  gateway: LLMGateway,
  req: LLMRequest,
  options: StructuredOptions,
): Promise<LLMResponse> {
  const sf = options.streamField;
  if (!sf) return gateway.generate(req);
  let buffer = '';
  let lastEmitted = '';
  return gateway.stream(req, (delta) => {
    buffer += delta;
    const value = extractPartialStringField(buffer, sf.name);
    if (value !== null && value !== lastEmitted) {
      lastEmitted = value;
      sf.onField(value);
    }
  });
}

type Check<T> = { ok: true; data: T } | { ok: false; problems: string };

function validate<S extends z.ZodType>(
  schema: S,
  text: string,
  options: StructuredOptions,
): Check<z.infer<S>> {
  const json = extractJsonObject(text);
  if (json === null)
    return { ok: false, problems: '- (root): response did not contain a JSON object' };
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, problems: formatIssues(parsed.error) };
  const extra = options.refine?.(parsed.data);
  if (extra) return { ok: false, problems: `- ${extra}` };
  return { ok: true, data: parsed.data };
}
