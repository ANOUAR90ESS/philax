/** Model tiers (§36): cheap classification → strong reasoning → premium synthesis. */
export const LLM_TIERS = ['fast', 'strong', 'premium'] as const;
export type LLMTier = (typeof LLM_TIERS)[number];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Request as seen by a concrete provider (model already resolved). */
export interface ProviderRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Ask the provider for a JSON object response where it supports it. */
  json: boolean;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ProviderResponse {
  text: string;
  usage: TokenUsage;
  stopReason: string | null;
}

export type StreamChunk =
  { type: 'text'; text: string } | { type: 'done'; usage: TokenUsage; stopReason: string | null };

export interface LLMProvider {
  readonly name: string;
  generate(request: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse>;
  stream(request: ProviderRequest, signal: AbortSignal): AsyncIterable<StreamChunk>;
}

/** Request as seen by business modules: a tier, never a vendor or model. */
export interface LLMRequest {
  tier: LLMTier;
  /** Logical operation name for telemetry, e.g. "topic.analyze". */
  operation: string;
  promptVersion: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  json?: boolean;
  trace?: LLMTraceContext;
}

export interface LLMTraceContext {
  debateId?: string;
  topicId?: string;
  retrievalCount?: number;
}

export interface LLMResponse {
  text: string;
  usage: TokenUsage;
  provider: string;
  model: string;
  latencyMs: number;
  attempt: number;
}

export interface LLMGateway {
  generate(request: LLMRequest): Promise<LLMResponse>;
  /** Streams text; `onText` receives deltas. Resolves with the full response. */
  stream(request: LLMRequest, onText: (delta: string) => void): Promise<LLMResponse>;
  /** Records the outcome of validating a response (structured output, consistency). */
  recordValidation(request: LLMRequest, response: LLMResponse, status: ValidationStatus): void;
  readonly available: boolean;
}

export type ValidationStatus = 'not_validated' | 'valid' | 'repaired' | 'invalid' | 'rejected';

/** Telemetry record (§52). Contains no prompt or completion content. */
export interface LLMCallRecord {
  operation: string;
  tier: LLMTier;
  provider: string;
  model: string;
  promptVersion: string;
  attempt: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  validationStatus: ValidationStatus | 'error';
  errorCode: string | null;
  trace: LLMTraceContext;
}

export type LLMErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'server'
  | 'network'
  | 'auth'
  | 'bad_request'
  | 'refusal'
  | 'truncated'
  | 'not_configured';

const RETRYABLE: ReadonlySet<LLMErrorKind> = new Set([
  'timeout',
  'rate_limit',
  'server',
  'network',
]);
/** Errors after which trying the next provider/model may help. */
const FALLBACK_OK: ReadonlySet<LLMErrorKind> = new Set([
  'timeout',
  'rate_limit',
  'server',
  'network',
  'auth',
  'refusal',
]);

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly provider: string;
  readonly status: number | null;

  constructor(
    kind: LLMErrorKind,
    provider: string,
    message: string,
    status: number | null = null,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'LLMError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  get allowsFallback(): boolean {
    return FALLBACK_OK.has(this.kind);
  }
}

export function classifyHttpStatus(status: number): LLMErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}
