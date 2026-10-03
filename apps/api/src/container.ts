import type { Env } from '@philax/config';
import { PoolDb, type Db } from '@philax/database';
import { UsageService } from '@philax/billing';
import { PasswordAuthService, type AuthService } from '@philax/users';
import { NoopAnalytics, PostHogAnalytics, type Analytics } from './services/analytics';

/**
 * Composition root: the only place concrete implementations are chosen.
 * Tests pass `overrides` to swap infrastructure (e.g. the LLM provider) through
 * the same interfaces production uses.
 */
export interface Container {
  env: Env;
  db: Db;
  auth: AuthService;
  usage: UsageService;
  analytics: Analytics;
  close(): Promise<void>;
}

export interface ContainerOverrides {
  db?: Db;
  analytics?: Analytics;
}

export function createContainer(env: Env, overrides: ContainerOverrides = {}): Container {
  const pool = overrides.db ? null : new PoolDb(env.DATABASE_URL);
  const db: Db = overrides.db ?? (pool as PoolDb);
  const analytics =
    overrides.analytics ??
    (env.POSTHOG_KEY
      ? new PostHogAnalytics(env.POSTHOG_KEY, env.POSTHOG_HOST, (err) =>
          console.warn('[analytics] capture failed', (err as Error).message),
        )
      : new NoopAnalytics());

  return {
    env,
    db,
    auth: new PasswordAuthService(db),
    usage: new UsageService(db),
    analytics,
    close: async () => {
      await pool?.close();
    },
  };
}
