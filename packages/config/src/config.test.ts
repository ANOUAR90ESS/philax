import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './index';
import { parseDotEnv } from './dotenv';

describe('loadEnv', () => {
  it('applies defaults and parses lists', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://x',
      CORS_ORIGINS: 'http://a.test, http://b.test',
      LLM_TIER_FAST: 'openai:gpt-x,anthropic:claude-y',
      OPENAI_API_KEY: '  ',
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.LLM_TIER_FAST).toEqual(['openai:gpt-x', 'anthropic:claude-y']);
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('never echoes secret values in errors', () => {
    try {
      loadEnv({ API_PORT: 'super-secret-value' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect(String(e)).not.toContain('super-secret-value');
      expect(String(e)).toContain('DATABASE_URL');
    }
  });

  it('requires a strong session secret in production', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'x', CORS_ORIGINS: 'https://a' }),
    ).toThrow(/SESSION_SECRET/);
  });
});

describe('parseDotEnv', () => {
  it('parses quoted values and comments', () => {
    expect(parseDotEnv('# c\nA=1\nB="two words"\nC=x # trailing\n\nBAD')).toEqual({
      A: '1',
      B: 'two words',
      C: 'x',
    });
  });
});
