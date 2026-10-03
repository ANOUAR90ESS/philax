import Anthropic from '@anthropic-ai/sdk';
import {
  LLMError,
  classifyHttpStatus,
  type LLMProvider,
  type ProviderRequest,
  type ProviderResponse,
  type StreamChunk,
} from '../types';

function toLLMError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  if (err instanceof Anthropic.APIUserAbortError)
    return new LLMError('timeout', 'anthropic', 'Request aborted', null, err);
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return new LLMError('timeout', 'anthropic', 'Request timed out', null, err);
  if (err instanceof Anthropic.APIConnectionError)
    return new LLMError('network', 'anthropic', 'Connection error', null, err);
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
    return new LLMError(
      classifyHttpStatus(err.status),
      'anthropic',
      `Anthropic API error ${err.status}`,
      err.status,
      err,
    );
  }
  return new LLMError('network', 'anthropic', 'Unknown Anthropic error', null, err);
}

function checkStop(stopReason: string | null): void {
  if (stopReason === 'refusal')
    throw new LLMError('refusal', 'anthropic', 'The model declined the request');
  if (stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded') {
    throw new LLMError('truncated', 'anthropic', 'The response was truncated');
  }
}

/**
 * Claude via the official Anthropic SDK. Retries are disabled in the SDK because
 * the gateway owns retry/fallback policy. Sampling parameters are not sent: current
 * Claude models reject them, and depth is controlled by the model's adaptive thinking.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  private params(req: ProviderRequest) {
    return {
      model: req.model,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  async generate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    try {
      const msg = await this.client.messages.create(this.params(req), { signal });
      checkStop(msg.stop_reason);
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return {
        text,
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
        stopReason: msg.stop_reason,
      };
    } catch (err) {
      throw toLLMError(err);
    }
  }

  async *stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
    try {
      const stream = this.client.messages.stream(this.params(req), { signal });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      checkStop(final.stop_reason);
      yield {
        type: 'done',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
        stopReason: final.stop_reason,
      };
    } catch (err) {
      throw toLLMError(err);
    }
  }
}
