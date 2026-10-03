import type { FastifyInstance } from 'fastify';
import type { AuthController } from '../controllers/auth.controller';
import { requireUser } from '../plugins/auth';

export function authRoutes(app: FastifyInstance, c: AuthController): void {
  // Stricter limit on credential endpoints to slow down brute force.
  const credentialLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  app.post('/api/auth/register', credentialLimit, c.register);
  app.post('/api/auth/login', credentialLimit, c.login);
  app.post('/api/auth/logout', c.logout);
  app.get('/api/auth/me', { preHandler: requireUser }, c.me);
  app.patch('/api/auth/me', { preHandler: requireUser }, c.updateMe);
  app.delete('/api/auth/me', { preHandler: requireUser }, c.deleteMe);
}
