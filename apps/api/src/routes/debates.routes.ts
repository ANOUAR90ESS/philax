import type { FastifyInstance } from 'fastify';
import type { CharactersController } from '../controllers/characters.controller';
import type { DebatesController } from '../controllers/debates.controller';
import { requireUser } from '../plugins/auth';

export function debateRoutes(app: FastifyInstance, c: DebatesController): void {
  const auth = { preHandler: requireUser };
  // Generation endpoints are expensive: tighter per-client limits on top of daily quotas.
  const generation = {
    preHandler: requireUser,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  };
  app.post('/api/debates', generation, c.create);
  app.post('/api/challenges', generation, c.createChallenge);
  app.get('/api/debates', auth, c.list);
  app.get('/api/debates/:id', auth, c.get);
  app.post('/api/debates/:id/advance', generation, c.advance);
  app.post('/api/debates/:id/messages', generation, c.postMessage);
  app.post('/api/debates/:id/save', auth, c.save);
  app.delete('/api/debates/:id', auth, c.remove);
  app.post('/api/debates/:id/events', auth, c.event);
}

export function characterRoutes(app: FastifyInstance, c: CharactersController): void {
  app.get('/api/characters/:id', c.get);
}
