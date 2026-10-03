import type { Db } from '@philax/database';
import type { FastifyInstance } from 'fastify';

export function healthRoutes(app: FastifyInstance, db: Db): void {
  app.get('/api/health', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'degraded' });
    }
  });
}
