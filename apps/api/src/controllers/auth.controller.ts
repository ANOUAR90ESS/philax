import { LocaleSchema, LoginRequestSchema, RegisterRequestSchema } from '@philax/types';
import type { AuthService } from '@philax/users';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseOrThrow } from '../http/validation';
import { clearSessionCookie, currentUser, SESSION_COOKIE, setSessionCookie } from '../plugins/auth';
import type { Analytics } from '../services/analytics';

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly secureCookies: boolean,
    private readonly analytics: Analytics,
  ) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseOrThrow(RegisterRequestSchema, request.body);
    const result = await this.auth.register(input);
    setSessionCookie(reply, result.sessionToken, result.expiresAt, this.secureCookies);
    this.analytics.capture(result.user.id, 'user_registered');
    return reply.status(201).send({ user: result.user });
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = parseOrThrow(LoginRequestSchema, request.body);
    const result = await this.auth.login(input);
    setSessionCookie(reply, result.sessionToken, result.expiresAt, this.secureCookies);
    return reply.send({ user: result.user });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await this.auth.logout(token);
    clearSessionCookie(reply, this.secureCookies);
    return reply.status(204).send();
  };

  me = async (request: FastifyRequest) => ({ user: currentUser(request) });

  updateMe = async (request: FastifyRequest) => {
    const user = currentUser(request);
    const { locale } = parseOrThrow(z.object({ locale: LocaleSchema }), request.body);
    await this.auth.updateLocale(user.id, locale);
    return { user: { ...user, locale } };
  };

  deleteMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = currentUser(request);
    await this.auth.deleteAccount(user.id);
    clearSessionCookie(reply, this.secureCookies);
    return reply.status(204).send();
  };
}
