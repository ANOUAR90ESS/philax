import { loadDotEnv, loadEnv } from '@philax/config';
import { buildApp } from './app';
import { createContainer } from './container';

loadDotEnv();
const env = loadEnv();
const container = createContainer(env);
const app = await buildApp(container);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await container.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.API_HOST, port: env.API_PORT });

// Housekeeping: remove expired sessions hourly (privacy: no stale credentials kept).
const purge = () =>
  container.auth
    .purgeExpiredSessions()
    .then((n) => n && app.log.info({ removed: n }, 'expired sessions purged'))
    .catch((err: unknown) => app.log.warn({ err }, 'session purge failed'));
void purge();
setInterval(() => void purge(), 60 * 60 * 1000).unref();
