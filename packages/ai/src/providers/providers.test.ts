import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTiers } from '../factory';
import { estimateCostUsd } from '../pricing';
import { GoogleProvider } from './google';
import { OpenAIProvider } from './openai';

const req = {
  model: 'm',
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'q' }],
  maxOutputTokens: 100,
  json: true,
};
const signal = new AbortController().signal;

function sse(frames: string[]): Response {
  return new Response(frames.map((f) => `data: ${f}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('OpenAIProvider', () => {
  it('streams deltas and usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
          JSON.stringify({ choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] }),
          JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
          '[DONE]',
        ]),
      ),
    );
    const chunks = [];
    for await (const c of new OpenAIProvider('k').stream(req, signal)) chunks.push(c);
    expect(chunks).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', usage: { inputTokens: 3, outputTokens: 2 }, stopReason: 'stop' },
    ]);
  });

  it('maps HTTP 429 to a retryable rate_limit error and truncation to an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );
    await expect(new OpenAIProvider('k').generate(req, signal)).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: '{' }, finish_reason: 'length' }] }),
      ),
    );
    await expect(new OpenAIProvider('k').generate(req, signal)).rejects.toMatchObject({
      kind: 'truncated',
    });
  });

  it('sends the key only in the Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await new OpenAIProvider('secret-key').generate(req, signal);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).not.toContain('secret-key');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
  });
});

describe('GoogleProvider', () => {
  it('ignores thought parts and maps safety blocks to refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          candidates: [
            {
              content: { parts: [{ text: 'thinking', thought: true }, { text: 'answer' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
        }),
      ),
    );
    expect((await new GoogleProvider('k').generate(req, signal)).text).toBe('answer');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ candidates: [{ finishReason: 'SAFETY' }] })),
    );
    await expect(new GoogleProvider('k').generate(req, signal)).rejects.toMatchObject({
      kind: 'refusal',
    });
  });
});

describe('tier resolution and pricing', () => {
  it('uses explicit targets or defaults for configured providers', () => {
    const tiers = resolveTiers({ fast: ['openai:x', 'google:y'], strong: [], premium: [] }, [
      'anthropic',
    ]);
    expect(tiers.fast).toEqual([
      { provider: 'openai', model: 'x' },
      { provider: 'google', model: 'y' },
    ]);
    expect(tiers.strong).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-5-5' }]);
  });
  it('estimates cost only for known models', () => {
    expect(estimateCostUsd('anthropic', 'claude-opus-5-5', 1_000_000, 100_000)).toBe(6);
    expect(estimateCostUsd('openai', 'unknown', 10, 10)).toBeNull();
  });
});
