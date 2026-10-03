import Fastify, { type FastifyInstance } from 'fastify';
import type { Container } from './container';
import { AuthController } from './controllers/auth.controller';
import { registerAuth } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSecurity } from './plugins/security';
import { authRoutes } from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(
  container: Container,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const { env } = container;
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            // Never log credentials, cookies or request bodies.
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                'res.headers["set-cookie"]',
                '*.password',
                '*.apiKey',
              ],
              censor: '[redacted]',
            },
          },
    bodyLimit: 256 * 1024,
    trustProxy: env.NODE_ENV === 'production',
    genReqId: () => crypto.randomUUID(),
  });

  registerErrorHandler(app);
  await registerSecurity(app, {
    corsOrigins: env.CORS_ORIGINS,
    globalRateLimit: env.NODE_ENV === 'test' ? 10_000 : 300,
  });
  registerAuth(app, container.auth);

  const secureCookies = env.NODE_ENV === 'production';
  healthRoutes(app, container.db);
  authRoutes(app, new AuthController(container.auth, secureCookies, container.analytics));

  return app;
}
