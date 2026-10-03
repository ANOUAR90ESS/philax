import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppError } from '@philax/types';
import type { FastifyInstance } from 'fastify';

export interface SecurityOptions {
  corsOrigins: string[];
  /** Requests per minute per client for the whole API. */
  globalRateLimit: number;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function registerSecurity(app: FastifyInstance, opts: SecurityOptions): Promise<void> {
  await app.register(helmet, {
    // The API serves JSON/SSE only; a strict CSP is safe.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: opts.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: opts.globalRateLimit,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  // CSRF defence in depth: session cookies are SameSite=Lax, mutating requests must
  // be JSON (forces a CORS preflight cross-site) and, when an Origin header is
  // present, it must be an allowed origin.
  app.addHook('onRequest', async (request) => {
    if (!MUTATING.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin && !opts.corsOrigins.includes(origin)) {
      throw new AppError('FORBIDDEN', 'Origin not allowed.');
    }
    const hasBody =
      request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0';
    const type = request.headers['content-type'] ?? '';
    if (hasBody && !type.startsWith('application/json')) {
      throw new AppError('VALIDATION_FAILED', 'Requests must use application/json.');
    }
  });
}
