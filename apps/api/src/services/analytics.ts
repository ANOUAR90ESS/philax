/**
 * Product analytics (§53). Only event names and non-content properties are sent;
 * user-entered text, debate content and URLs are never included.
 */
export const ANALYTICS_EVENTS = [
  'user_registered',
  'input_submitted',
  'topic_analyzed',
  'debate_started',
  'character_selected',
  'round_completed',
  'user_joined_debate',
  'debate_completed',
  'source_opened',
  'debate_saved',
  'challenge_started',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface Analytics {
  capture(distinctId: string, event: AnalyticsEvent, properties?: AnalyticsProperties): void;
}

export class NoopAnalytics implements Analytics {
  capture(): void {}
}

/** Server-side PostHog capture over its public HTTP API; failures never affect requests. */
export class PostHogAnalytics implements Analytics {
  constructor(
    private readonly apiKey: string,
    private readonly host: string,
    private readonly onError: (err: unknown) => void,
  ) {}

  capture(distinctId: string, event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
    void fetch(`${this.host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, event, distinct_id: distinctId, properties }),
      signal: AbortSignal.timeout(5000),
    }).catch(this.onError);
  }
}
