import {
  AppError,
  ERROR_CODES,
  EVENTS,
  JwtSessions,
  verifyPassword,
  SESSION_TTL_SECONDS,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { AuthRepository } from './repository';
import {
  shouldLock,
  isLocked,
  remainingLockMinutes,
  FAILURE_WINDOW_MS,
} from './lockPolicy';

export { authenticationMigrations } from './migrations';
export * from './lockPolicy';

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  memberId: string;
}

/**
 * Authentication operations. DB, bus, and the JWT signer are injected so the
 * service is unit-testable without HTTP or a live database.
 */
export class AuthenticationService {
  private readonly repo: AuthRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly sessions: JwtSessions,
  ) {
    this.repo = new AuthRepository(db);
  }

  /**
   * Authenticate a member. On success issues a JWT. On failure records the
   * attempt and, if the threshold is met, locks the account and publishes
   * member.account_locked. Never reveals which field was wrong (Req 2.2).
   */
  async login(email: string, password: string, now: Date = new Date()): Promise<LoginResult> {
    const nowMs = now.getTime();
    const member = await this.repo.findByEmail(email);

    // Uniform failure to avoid leaking whether the email exists.
    if (!member) {
      throw new AppError(ERROR_CODES.AUTHENTICATION_FAILED, 'Invalid email or password', 401);
    }

    // Already locked?
    const lockUntil = await this.repo.getLockUntil(member.id);
    if (isLocked(lockUntil, nowMs)) {
      throw this.lockedError(lockUntil!, nowMs);
    }

    const ok = await verifyPassword(password, member.password_hash);
    if (!ok) {
      await this.repo.recordAttempt(member.id, false);
      const failures = await this.repo.recentFailureTimestamps(member.id, FAILURE_WINDOW_MS, now);
      const newLockUntil = shouldLock(failures, nowMs);
      if (newLockUntil !== null) {
        const lockDate = new Date(newLockUntil);
        await this.repo.setLock(member.id, lockDate);
        await this.bus.publish(EVENTS.MEMBER_ACCOUNT_LOCKED, {
          memberId: member.id,
          email: member.email,
          lockedUntil: lockDate.toISOString(),
        });
        throw this.lockedError(newLockUntil, nowMs);
      }
      throw new AppError(ERROR_CODES.AUTHENTICATION_FAILED, 'Invalid email or password', 401);
    }

    // Success: record it and clear any lock.
    await this.repo.recordAttempt(member.id, true);
    await this.repo.clearLockAndFailures(member.id);

    const { token, expiresIn } = await this.sessions.issue(member.id);
    return { accessToken: token, expiresIn, memberId: member.id };
  }

  /** Invalidate a session token by recording its jti as revoked (Req 2.5). */
  async logout(token: string, now: Date = new Date()): Promise<void> {
    let claims;
    try {
      claims = await this.sessions.verify(token);
    } catch {
      // Already invalid/expired: logout is idempotent, treat as success.
      return;
    }
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    await this.repo.revokeSession(claims.jti, claims.sub, expiresAt);
  }

  /**
   * Validate a session: verify signature/expiry, then confirm it has not been
   * revoked (Phase 0 Redis stand-in). Returns the member id.
   */
  async validateSession(token: string): Promise<{ memberId: string }> {
    const claims = await this.sessions.verify(token);
    if (await this.repo.isSessionRevoked(claims.jti)) {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, 'Session is no longer valid', 401);
    }
    return { memberId: claims.sub };
  }

  private lockedError(lockUntilMs: number, nowMs: number): AppError {
    const mins = remainingLockMinutes(lockUntilMs, nowMs);
    return new AppError(
      ERROR_CODES.ACCOUNT_LOCKED,
      `Account is temporarily locked. Try again in ${mins} minute(s).`,
      403,
      { lockedUntil: new Date(lockUntilMs).toISOString(), remainingMinutes: mins },
    );
  }
}
