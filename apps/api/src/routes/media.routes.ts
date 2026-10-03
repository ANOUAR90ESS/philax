import type { FastifyInstance } from 'fastify';
import type { MediaController } from '../controllers/media.controller';
import { requireUser } from '../plugins/auth';

export function mediaRoutes(app: FastifyInstance, c: MediaController): void {
  const auth = { preHandler: requireUser };
  // Every generation call spends provider credits: per-client limits on top of the global one.
  const generation = {
    preHandler: requireUser,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  };
  const sessions = {
    preHandler: requireUser,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  };
  app.get('/api/media/status', auth, c.status);
  app.get('/api/media/debates/:id/cast', auth, c.cast);
  app.post('/api/media/speech', generation, c.speech);
  app.post('/api/media/avatar/sessions', sessions, c.openSession);
  app.post('/api/media/avatar/sessions/:id/speak', generation, c.speak);
  app.post('/api/media/avatar/sessions/:id/interrupt', auth, c.interrupt);
  app.delete('/api/media/avatar/sessions/:id', auth, c.closeSession);
  app.post('/api/media/videos', generation, c.renderSegment);
  app.get('/api/media/videos/:id', auth, c.segmentStatus);
}
