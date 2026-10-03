import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP-recommended scrypt parameters (N=2^15, r=8, p=1 → ~32 MiB).
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LEN = 64;
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, { ...params, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A valid hash of a random password, used to equalize timing for unknown emails. */
export const DUMMY_PASSWORD_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + Buffer.alloc(KEY_LEN).toString('base64url');
