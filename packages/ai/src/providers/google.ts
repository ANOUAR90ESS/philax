import {
  LLMError,
  type LLMProvider,
  type ProviderRequest,
  type ProviderResponse,
  type StreamChunk,
} from '../types';
import { postJson, readSseData } from './http';

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function textOf(r: GeminiResponse): string {
  return (r.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
}

function check(r: GeminiResponse, final: boolean): void {
  if (r.promptFeedback?.blockReason) throw new LLMError('refusal', 'google', 'Prompt blocked');
  const reason = r.candidates?.[0]?.finishReason;
  if (!final || !reason) return;
  if (reason === 'MAX_TOKENS')
    throw new LLMError('truncated', 'google', 'The response was truncated');
  if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'PROHIBITED_CONTENT') {
    throw new LLMError('refusal', 'google', 'The model declined the request');
  }
}

/** Google Gemini (Generative Language API) over fetch. */
export class GoogleProvider implements LLMProvider {
  readonly name = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  ) {}

  private body(req: ProviderRequest) {
    return {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
  }

  private headers() {
    return { 'x-goog-api-key': this.apiKey };
  }

  async generate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`;
    const res = await postJson(this.name, url, this.headers(), this.body(req), signal);
    const json = (await res.json()) as GeminiResponse;
    check(json, true);
    return {
      text: textOf(json),
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
      },
      stopReason: json.candidates?.[0]?.finishReason ?? null,
    };
  }

  async *stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
    const res = await postJson(this.name, url, this.headers(), this.body(req), signal);
    let last: GeminiResponse = {};
    for await (const data of readSseData(res)) {
      const chunk = JSON.parse(data) as GeminiResponse;
      check(chunk, false);
      const text = textOf(chunk);
      if (text) yield { type: 'text', text };
      last = chunk;
    }
    check(last, true);
    yield {
      type: 'done',
      usage: {
        inputTokens: last.usageMetadata?.promptTokenCount ?? null,
        outputTokens: last.usageMetadata?.candidatesTokenCount ?? null,
      },
      stopReason: last.candidates?.[0]?.finishReason ?? null,
    };
  }
}
