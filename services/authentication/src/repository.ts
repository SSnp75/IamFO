import type { Db, Row } from '@iamfriendof/shared';

export interface AuthMemberRow extends Row {
  id: string;
  email: string;
  password_hash: string;
  is_verified: boolean;
  is_suspended: boolean;
}

/** Data access for authentication: members, attempts, locks, revoked sessions. */
export class AuthRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string): Promise<AuthMemberRow | undefined> {
    const res = await this.db.queryRead<AuthMemberRow>(
      `SELECT id, email, password_hash, is_verified, is_suspended
       FROM members WHERE lower(email) = lower($1)`,
      [email],
    );
    return res.rows[0];
  }

  async recordAttempt(memberId: string, succeeded: boolean): Promise<void> {
    await this.db.queryWrite(
      'INSERT INTO login_attempts (member_id, succeeded) VALUES ($1, $2)',
      [memberId, succeeded],
    );
  }

  /** Failed-attempt timestamps (ms) within the last `windowMs`, most recent first. */
  async recentFailureTimestamps(memberId: string, windowMs: number, now: Date): Promise<number[]> {
    const since = new Date(now.getTime() - windowMs).toISOString();
    const res = await this.db.queryRead<{ attempted_at: string }>(
      `SELECT attempted_at FROM login_attempts
       WHERE member_id = $1 AND succeeded = FALSE AND attempted_at > $2
       ORDER BY attempted_at DESC`,
      [memberId, since],
    );
    return res.rows.map((r) => new Date(r.attempted_at).getTime());
  }

  async getLockUntil(memberId: string): Promise<number | null> {
    const res = await this.db.queryRead<{ locked_until: string }>(
      'SELECT locked_until FROM account_locks WHERE member_id = $1',
      [memberId],
    );
    const row = res.rows[0];
    return row ? new Date(row.locked_until).getTime() : null;
  }

  async setLock(memberId: string, lockUntil: Date): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO account_locks (member_id, locked_until) VALUES ($1, $2)
       ON CONFLICT (member_id) DO UPDATE SET locked_until = EXCLUDED.locked_until`,
      [memberId, lockUntil.toISOString()],
    );
  }

  async clearLockAndFailures(memberId: string): Promise<void> {
    await this.db.queryWrite('DELETE FROM account_locks WHERE member_id = $1', [memberId]);
    // Successful login clears the failure streak by recording success; historical
    // failures naturally age out of the window. No destructive delete needed.
  }

  async revokeSession(jti: string, memberId: string, expiresAt: Date): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO revoked_sessions (jti, member_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (jti) DO NOTHING`,
      [jti, memberId, expiresAt.toISOString()],
    );
  }

  async isSessionRevoked(jti: string): Promise<boolean> {
    const res = await this.db.queryRead<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM revoked_sessions WHERE jti = $1) AS exists',
      [jti],
    );
    return res.rows[0]?.exists ?? false;
  }
}
