import { describe, expect, it } from 'vitest';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';
import { generateSessionToken, hashSessionToken } from './session-token';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password!!', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same-password-1')).not.toBe(await hashPassword('same-password-1'));
  });

  it('rejects malformed hashes and the dummy hash', async () => {
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
    expect(await verifyPassword('anything', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe('session tokens', () => {
  it('are random and hashed deterministically', () => {
    const t = generateSessionToken();
    expect(t).not.toBe(generateSessionToken());
    expect(hashSessionToken(t)).toBe(hashSessionToken(t));
    expect(hashSessionToken(t)).not.toContain(t);
  });
});
