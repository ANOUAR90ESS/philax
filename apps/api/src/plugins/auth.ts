import { AppError, type UserView } from '@philax/types';
import type { AuthService } from '@philax/users';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'philax_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserView | null;
  }
}

export function registerAuth(app: FastifyInstance, auth: AuthService): void {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? await auth.authenticate(token) : null;
  });
}

export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.');
}

export function currentUser(request: FastifyRequest): UserView {
  if (!request.user) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.');
  return request.user;
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
