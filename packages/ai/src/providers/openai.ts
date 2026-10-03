import {
  LLMError,
  type LLMProvider,
  type ProviderRequest,
  type ProviderResponse,
  type StreamChunk,
} from '../types';
import { postJson, readSseData } from './http';

interface ChatCompletion {
  choices: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
interface ChatChunk {
  choices?: {
    delta?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

function check(finish: string | null | undefined, refusal: string | null | undefined): void {
  if (refusal) throw new LLMError('refusal', 'openai', 'The model declined the request');
  if (finish === 'length') throw new LLMError('truncated', 'openai', 'The response was truncated');
  if (finish === 'content_filter') throw new LLMError('refusal', 'openai', 'Content filtered');
}

/** OpenAI Chat Completions API over fetch. */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  private body(req: ProviderRequest, stream: boolean) {
    return {
      model: req.model,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      max_completion_tokens: req.maxOutputTokens,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }

  async generate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const res = await postJson(
      this.name,
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      this.body(req, false),
      signal,
    );
    const json = (await res.json()) as ChatCompletion;
    const choice = json.choices[0];
    check(choice?.finish_reason, choice?.message?.refusal);
    return {
      text: choice?.message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      },
      stopReason: choice?.finish_reason ?? null,
    };
  }

  async *stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
    const res = await postJson(
      this.name,
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      this.body(req, true),
      signal,
    );
    let finish: string | null = null;
    let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
    for await (const data of readSseData(res)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as ChatChunk;
      const choice = chunk.choices?.[0];
      if (choice?.delta?.refusal) check(null, choice.delta.refusal);
      if (choice?.delta?.content) yield { type: 'text', text: choice.delta.content };
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage)
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? null,
          outputTokens: chunk.usage.completion_tokens ?? null,
        };
    }
    check(finish, null);
    yield { type: 'done', usage, stopReason: finish };
  }
}
