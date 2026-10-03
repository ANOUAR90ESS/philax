import { estimateCostUsd } from './pricing';
import {
  LLMError,
  type LLMCallRecord,
  type LLMGateway,
  type LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMTier,
  type ProviderRequest,
  type ValidationStatus,
} from './types';

export interface ModelTarget {
  provider: string;
  model: string;
}

export interface GatewayOptions {
  providers: LLMProvider[];
  /** Ordered targets per tier: first is primary, the rest are fallbacks. */
  tiers: Record<LLMTier, ModelTarget[]>;
  timeoutMs: number;
  maxRetries: number;
  defaultMaxOutputTokens?: number;
  onCall?: (record: LLMCallRecord) => void;
  /** Injected for tests; defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter, capped at 8s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.round(random() * Math.min(8000, 500 * 2 ** attempt));
}

/**
 * The only entry point business modules use for LLM calls (§17). Resolves a tier
 * to provider/model targets, applies timeout + retry with backoff per target, and
 * falls back to the next target on errors where that can help (§55).
 */
export class DefaultLLMGateway implements LLMGateway {
  private readonly providers: Map<string, LLMProvider>;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: GatewayOptions) {
    this.providers = new Map(opts.providers.map((p) => [p.name, p]));
    this.sleep = opts.sleep ?? defaultSleep;
  }

  get available(): boolean {
    return this.opts.tiers.strong.some((t) => this.providers.has(t.provider));
  }

  generate(request: LLMRequest): Promise<LLMResponse> {
    return this.run(request, async (provider, preq, signal) => provider.generate(preq, signal));
  }

  stream(request: LLMRequest, onText: (delta: string) => void): Promise<LLMResponse> {
    return this.run(request, async (provider, preq, signal, markStarted) => {
      let text = '';
      let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
      let stopReason: string | null = null;
      for await (const chunk of provider.stream(preq, signal)) {
        if (chunk.type === 'text') {
          markStarted();
          text += chunk.text;
          onText(chunk.text);
        } else {
          usage = chunk.usage;
          stopReason = chunk.stopReason;
        }
      }
      return { text, usage, stopReason };
    });
  }

  recordValidation(request: LLMRequest, response: LLMResponse, status: ValidationStatus): void {
    this.emit(
      request,
      response.provider,
      response.model,
      response.attempt,
      response.latencyMs,
      response.usage.inputTokens,
      response.usage.outputTokens,
      status,
      null,
    );
  }

  private targets(tier: LLMTier): ModelTarget[] {
    const configured = this.opts.tiers[tier].filter((t) => this.providers.has(t.provider));
    if (configured.length === 0) {
      throw new LLMError(
        'not_configured',
        'gateway',
        `No LLM provider configured for tier "${tier}"`,
      );
    }
    return configured;
  }

  private async run(
    request: LLMRequest,
    call: (
      provider: LLMProvider,
      preq: ProviderRequest,
      signal: AbortSignal,
      markStarted: () => void,
    ) => Promise<{ text: string; usage: LLMResponse['usage']; stopReason: string | null }>,
  ): Promise<LLMResponse> {
    let lastError: LLMError | null = null;
    let attempt = 0;
    for (const target of this.targets(request.tier)) {
      const provider = this.providers.get(target.provider) as LLMProvider;
      const preq: ProviderRequest = {
        model: target.model,
        system: request.system,
        messages: request.messages,
        maxOutputTokens: request.maxOutputTokens ?? this.opts.defaultMaxOutputTokens ?? 4096,
        json: request.json ?? false,
      };
      for (let retry = 0; retry <= this.opts.maxRetries; retry++) {
        attempt++;
        const started = Date.now();
        let streamStarted = false;
        try {
          const out = await call(provider, preq, AbortSignal.timeout(this.opts.timeoutMs), () => {
            streamStarted = true;
          });
          return {
            text: out.text,
            usage: out.usage,
            provider: provider.name,
            model: target.model,
            latencyMs: Date.now() - started,
            attempt,
          };
        } catch (err) {
          const e =
            err instanceof LLMError
              ? err
              : new LLMError('network', provider.name, 'Provider failure', null, err);
          lastError = e;
          this.emit(
            request,
            provider.name,
            target.model,
            attempt,
            Date.now() - started,
            null,
            null,
            'error',
            e.kind,
          );
          // Once tokens reached the caller, a retry would duplicate output: surface the error.
          if (streamStarted) throw e;
          if (!e.retryable) break;
          if (retry < this.opts.maxRetries) await this.sleep(backoffMs(retry));
        }
      }
      if (lastError && !lastError.allowsFallback) throw lastError;
    }
    throw lastError ?? new LLMError('not_configured', 'gateway', 'No targets attempted');
  }

  private emit(
    request: LLMRequest,
    provider: string,
    model: string,
    attempt: number,
    latencyMs: number,
    inputTokens: number | null,
    outputTokens: number | null,
    validationStatus: LLMCallRecord['validationStatus'],
    errorCode: string | null,
  ): void {
    if (!this.opts.onCall) return;
    try {
      this.opts.onCall({
        operation: request.operation,
        tier: request.tier,
        provider,
        model,
        promptVersion: request.promptVersion,
        attempt,
        latencyMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(provider, model, inputTokens, outputTokens),
        validationStatus,
        errorCode,
        trace: request.trace ?? {},
      });
    } catch {
      // Telemetry must never break a request.
    }
  }
}
