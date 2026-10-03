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
