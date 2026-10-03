import { buildApp, createContainer } from '@philax/api';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, resetUserData } from '../support/db';
import { testEnv } from '../support/env';

const db = createTestDb();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(createContainer(testEnv(), { db }), { logger: false });
});
afterAll(async () => {
  await app.close();
  await db.close();
});
beforeEach(() => resetUserData(db));

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return String(first).split(';')[0] ?? '';
}

describe('auth API', () => {
  it('registers, reads the session and logs out', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Ada@Example.org', password: 'a-long-password' },
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().user.email).toBe('ada@example.org');
    const cookie = cookieFrom(reg);
    expect(String(reg.headers['set-cookie'])).toMatch(/HttpOnly/i);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.plan).toBe('free');

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('stores only hashed passwords and session tokens', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'b@example.org', password: 'plaintext-password' },
    });
    const token = cookieFrom(reg).split('=')[1] ?? '';
    const { rows } = await db.query<{ password_hash: string; token_hash: string }>(
      `SELECT u.password_hash, s.token_hash FROM users u JOIN sessions s ON s.user_id = u.id`,
    );
    expect(rows[0]?.password_hash).not.toContain('plaintext-password');
    expect(rows[0]?.token_hash).not.toBe(token);
  });

  it('rejects duplicate emails, bad credentials and invalid payloads', async () => {
    const payload = { email: 'c@example.org', password: 'a-long-password' };
    await app.inject({ method: 'POST', url: '/api/auth/register', payload });
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload });
    expect(dup.statusCode).toBe(409);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'c@example.org', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_FAILED');
    expect(invalid.json().error.errorId).toBeTruthy();
  });

  it('rejects cross-origin mutations and non-JSON bodies', async () => {
    const evil = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'x@example.org', password: 'x' },
    });
    expect(evil.statusCode).toBe(403);
    const form = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=x',
    });
    expect(form.statusCode).toBe(400);
  });

  it('deletes the account and all associated data', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'd@example.org', password: 'a-long-password' },
    });
    const cookie = cookieFrom(reg);
    const del = await app.inject({ method: 'DELETE', url: '/api/auth/me', headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
    expect(rows[0]?.n).toBe(0);
  });
});
