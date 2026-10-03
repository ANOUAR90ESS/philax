import { uuidv7, type Db } from '@philax/database';
import {
  AppError,
  type Locale,
  type RegisterRequest,
  type LoginRequest,
  type UserView,
} from '@philax/types';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../domain/password';
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from '../domain/session-token';
import { SessionRepository } from '../repositories/session-repository';
import { UserRepository, type UserRecord } from '../repositories/user-repository';

export interface AuthResult {
  user: UserView;
  sessionToken: string;
  expiresAt: Date;
}

/** Interface the API depends on, so an external IdP can replace this implementation. */
export interface AuthService {
  register(input: RegisterRequest): Promise<AuthResult>;
  login(input: LoginRequest): Promise<AuthResult>;
  authenticate(sessionToken: string): Promise<UserView | null>;
  logout(sessionToken: string): Promise<void>;
  updateLocale(userId: string, locale: Locale): Promise<void>;
  deleteAccount(userId: string): Promise<void>;
  purgeExpiredSessions(): Promise<number>;
}

function toView(u: UserRecord): UserView {
  return { id: u.id, email: u.email, displayName: u.displayName, locale: u.locale, plan: u.plan };
}

export class PasswordAuthService implements AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;

  constructor(private readonly db: Db) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
  }

  async register(input: RegisterRequest): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.');
    const passwordHash = await hashPassword(input.password);
    const id = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        await new UserRepository(tx).create({
          id,
          email: input.email,
          passwordHash,
          displayName: input.displayName ?? null,
          locale: input.locale ?? 'en',
        });
        await tx.query(`INSERT INTO subscriptions (id, user_id, plan) VALUES ($1, $2, 'free')`, [
          uuidv7(),
          id,
        ]);
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('CONFLICT', 'An account with this email already exists.', {
          cause: err,
        });
      }
      throw err;
    }
    const user = await this.users.findById(id);
    if (!user) throw new AppError('INTERNAL', 'Account creation failed.');
    return this.startSession(user);
  }

  async login(input: LoginRequest): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    // Always run scrypt so response time does not reveal whether the email exists.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'Invalid email or password.');
    return this.startSession(user);
  }

  async authenticate(sessionToken: string): Promise<UserView | null> {
    if (!sessionToken || sessionToken.length > 128) return null;
    const userId = await this.sessions.touch(hashSessionToken(sessionToken));
    if (!userId) return null;
    const user = await this.users.findById(userId);
    return user ? toView(user) : null;
  }

  async logout(sessionToken: string): Promise<void> {
    await this.sessions.deleteByTokenHash(hashSessionToken(sessionToken));
  }

  async updateLocale(userId: string, locale: Locale): Promise<void> {
    await this.users.updateLocale(userId, locale);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.users.delete(userId);
  }

  purgeExpiredSessions(): Promise<number> {
    return this.sessions.deleteExpired();
  }

  private async startSession(user: UserRecord): Promise<AuthResult> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.sessions.create({
      id: uuidv7(),
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
    });
    return { user: toView(user), sessionToken, expiresAt };
  }
}
