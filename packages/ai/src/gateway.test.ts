import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DefaultLLMGateway, backoffMs } from './gateway';
import { generateStructured } from './structured';
import {
  LLMError,
  type LLMCallRecord,
  type LLMProvider,
  type ProviderRequest,
  type StreamChunk,
} from './types';

type Step = string | LLMError;

class FakeProvider implements LLMProvider {
  calls: ProviderRequest[] = [];
  constructor(
    readonly name: string,
    private readonly steps: Step[],
  ) {}
  private next(req: ProviderRequest): string {
    this.calls.push(req);
    const s = this.steps.shift();
    if (s === undefined) throw new Error('no more steps');
    if (s instanceof LLMError) throw s;
    return s;
  }
  async generate(req: ProviderRequest) {
    return {
      text: this.next(req),
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'end_turn',
    };
  }
  async *stream(req: ProviderRequest): AsyncIterable<StreamChunk> {
    const text = this.next(req);
    for (const part of text.match(/.{1,4}/gs) ?? []) yield { type: 'text', text: part };
    yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' };
  }
}

function gateway(providers: LLMProvider[], records: LLMCallRecord[] = []) {
  const targets = providers.map((p) => ({ provider: p.name, model: `${p.name}-model` }));
  return new DefaultLLMGateway({
    providers,
    tiers: { fast: targets, strong: targets, premium: targets },
    timeoutMs: 1000,
    maxRetries: 2,
    onCall: (r) => records.push(r),
    sleep: async () => undefined,
  });
}

const req = {
  tier: 'strong' as const,
  operation: 'test.op',
  promptVersion: 'test.v1',
  system: 's',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('DefaultLLMGateway', () => {
  it('retries retryable errors with backoff then succeeds', async () => {
    const p = new FakeProvider('a', [
      new LLMError('rate_limit', 'a', '429'),
      new LLMError('server', 'a', '500'),
      'ok',
    ]);
    const records: LLMCallRecord[] = [];
    const res = await gateway([p], records).generate(req);
    expect(res.text).toBe('ok');
    expect(res.attempt).toBe(3);
    expect(records.map((r) => r.errorCode)).toEqual(['rate_limit', 'server']);
    expect(records.every((r) => r.promptVersion === 'test.v1')).toBe(true);
  });

  it('falls back to the next provider when retries are exhausted', async () => {
    const a = new FakeProvider('a', [
      new LLMError('server', 'a', 'x'),
      new LLMError('server', 'a', 'x'),
      new LLMError('server', 'a', 'x'),
    ]);
    const b = new FakeProvider('b', ['from b']);
    const res = await gateway([a, b]).generate(req);
    expect(res).toMatchObject({ text: 'from b', provider: 'b', model: 'b-model' });
  });

  it('falls back immediately on refusal and auth errors (no retry)', async () => {
    const a = new FakeProvider('a', [new LLMError('refusal', 'a', 'no')]);
    const b = new FakeProvider('b', ['ok']);
    await gateway([a, b]).generate(req);
    expect(a.calls).toHaveLength(1);
  });

  it('does not retry or fall back on bad requests', async () => {
    const a = new FakeProvider('a', [new LLMError('bad_request', 'a', '400')]);
    const b = new FakeProvider('b', ['ok']);
    await expect(gateway([a, b]).generate(req)).rejects.toMatchObject({ kind: 'bad_request' });
    expect(b.calls).toHaveLength(0);
  });

  it('streams text deltas and returns the full text', async () => {
    const deltas: string[] = [];
    const res = await gateway([new FakeProvider('a', ['hello world'])]).stream(req, (d) =>
      deltas.push(d),
    );
    expect(deltas.join('')).toBe('hello world');
    expect(res.text).toBe('hello world');
  });

  it('never retries a stream after tokens were delivered', async () => {
    const failing: LLMProvider = {
      name: 'a',
      generate: async () => ({
        text: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: null,
      }),
      async *stream() {
        yield { type: 'text', text: 'partial' };
        throw new LLMError('network', 'a', 'dropped');
      },
    };
    let calls = 0;
    const counting: LLMProvider = { ...failing, stream: (r, s) => (calls++, failing.stream(r, s)) };
    await expect(gateway([counting]).stream(req, () => undefined)).rejects.toMatchObject({
      kind: 'network',
    });
    expect(calls).toBe(1);
  });

  it('reports not_configured when no provider serves the tier', async () => {
    const g = gateway([]);
    expect(g.available).toBe(false);
    await expect(g.generate(req)).rejects.toMatchObject({ kind: 'not_configured' });
  });

  it('caps backoff with jitter', () => {
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(10, () => 1)).toBe(8000);
    expect(backoffMs(3, () => 0)).toBe(0);
  });
});

describe('generateStructured', () => {
  const schema = z.object({ title: z.string().min(1), items: z.array(z.number()).min(1) });

  it('accepts valid JSON even inside code fences', async () => {
    const g = gateway([new FakeProvider('a', ['```json\n{"title":"t","items":[1]}\n```'])]);
    const out = await generateStructured(g, req, schema);
    expect(out).toMatchObject({ data: { title: 't', items: [1] }, repaired: false });
  });

  it('repairs once using validation feedback', async () => {
    const p = new FakeProvider('a', ['{"title":"","items":[]}', '{"title":"fixed","items":[2]}']);
    const records: LLMCallRecord[] = [];
    const out = await generateStructured(gateway([p], records), req, schema);
    expect(out.repaired).toBe(true);
    expect(p.calls[1]?.messages.at(-1)?.content).toMatch(/title/);
    expect(records.map((r) => r.validationStatus)).toEqual(['invalid', 'repaired']);
  });

  it('throws AI_OUTPUT_INVALID when repair also fails', async () => {
    const p = new FakeProvider('a', ['not json', '{"title":1}']);
    await expect(generateStructured(gateway([p]), req, schema)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
    });
  });

  it('applies refine checks', async () => {
    const p = new FakeProvider('a', ['{"title":"a","items":[1]}', '{"title":"b","items":[1]}']);
    const out = await generateStructured(gateway([p]), req, schema, {
      refine: (d) => ((d as { title: string }).title === 'a' ? 'title must not be "a"' : null),
    });
    expect(out.data.title).toBe('b');
  });

  it('streams a string field while generating', async () => {
    const seen: string[] = [];
    const p = new FakeProvider('a', [
      '{"speech":"Hello \\"world\\"\\nbye","items":[1],"title":"x"}',
    ]);
    await generateStructured(gateway([p]), req, schema, {
      streamField: { name: 'speech', onField: (v) => seen.push(v) },
    });
    expect(seen.at(-1)).toBe('Hello "world"\nbye');
    expect(seen.length).toBeGreaterThan(1);
  });
});
