import type { LLMProvider, ProviderRequest, ProviderResponse, StreamChunk } from '@philax/ai';
import { LLMError } from '@philax/ai';

/**
 * TEST DOUBLE ONLY (ADR-013). A deterministic LLMProvider driven by handlers that
 * inspect the prompt and return a completion. Implements the production interface,
 * so the gateway, structured-output validation and repair paths run for real.
 */
export type ScriptHandler = (
  req: ProviderRequest,
  callIndex: number,
) => string | LLMError | undefined;

export class ScriptedLLMProvider implements LLMProvider {
  readonly name: string;
  readonly calls: ProviderRequest[] = [];

  constructor(
    private readonly handlers: ScriptHandler[],
    name = 'scripted',
  ) {
    this.name = name;
  }

  private respond(req: ProviderRequest): string {
    const idx = this.calls.length;
    this.calls.push(req);
    for (const h of this.handlers) {
      const out = h(req, idx);
      if (out instanceof LLMError) throw out;
      if (out !== undefined) return out;
    }
    throw new Error(
      `ScriptedLLMProvider: no handler for prompt starting "${req.system.slice(0, 80)}"`,
    );
  }

  async generate(req: ProviderRequest): Promise<ProviderResponse> {
    const text = this.respond(req);
    return {
      text,
      usage: {
        inputTokens: Math.ceil(req.system.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
      stopReason: 'end_turn',
    };
  }

  async *stream(req: ProviderRequest): AsyncIterable<StreamChunk> {
    const text = this.respond(req);
    for (let i = 0; i < text.length; i += 24) yield { type: 'text', text: text.slice(i, i + 24) };
    yield {
      type: 'done',
      usage: {
        inputTokens: Math.ceil(req.system.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
      stopReason: 'end_turn',
    };
  }
}

/** Extracts the trusted <application_state> JSON a prompt carries (for fixture logic). */
export function readState<T = Record<string, unknown>>(req: ProviderRequest): T | null {
  const all = [req.system, ...req.messages.map((m) => m.content)].join('\n');
  const m = all.match(/<application_state>\n([\s\S]*?)\n<\/application_state>/);
  return m?.[1] ? (JSON.parse(m[1]) as T) : null;
}

export function lastUserMessage(req: ProviderRequest): string {
  return [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}
