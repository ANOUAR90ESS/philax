/**
 * USD per 1M tokens. Only prices we can source are listed (Anthropic first-party
 * rates as of 2026-09); unknown models yield `null` cost rather than a guess.
 * Extend via `registerPricing` from configuration.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'anthropic:claude-opus-5-5': { input: 4, output: 20 },
  'anthropic:claude-sonnet-5-5': { input: 2, output: 10 },
  'anthropic:claude-haiku-4-5': { input: 1, output: 5 },
};

export function registerPricing(key: string, price: { input: number; output: number }): void {
  PRICING[key] = price;
}

export function estimateCostUsd(
  provider: string,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = PRICING[`${provider}:${model}`];
  if (!price || inputTokens === null || outputTokens === null) return null;
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(6));
}
