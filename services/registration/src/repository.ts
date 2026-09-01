import type { Db, Row } from '@iamfriendof/shared';

export interface MemberRow extends Row {
  id: string;
  email: string;
  is_verified: boolean;
}

/** Data access for registration. Keeps SQL in one place, isolated from routes. */
export class RegistrationRepository {
  constructor(private readonly db: Db) {}

  async emailExists(email: string): Promise<boolean> {
    const res = await this.db.queryRead<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM members WHERE lower(email) = lower($1)) AS exists',
      [email],
    );
    return res.rows[0]?.exists ?? false;
  }

  /** Create a member and its verification token atomically. Returns member id. */
  async createMember(input: {
    firstName: string;
    lastName: string;
    email: string;
    country: string;
    passwordHash: string;
    verificationToken: string;
    tokenExpiresAt: Date;
  }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const member = await tx.query<{ id: string }>(
        `INSERT INTO members (first_name, last_name, email, country, password_hash, is_verified)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id`,
        [input.firstName, input.lastName, input.email, input.country, input.passwordHash],
      );
      const memberId = member.rows[0]!.id;
      await tx.query(
        `INSERT INTO email_verifications (member_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [memberId, input.verificationToken, input.tokenExpiresAt.toISOString()],
      );
      return memberId;
    });
  }

  /**
   * Consume a verification token: mark verified if the token exists, is unused,
   * and not expired. Returns 'ok' | 'invalid'.
   */
  async consumeVerification(token: string, now: Date): Promise<'ok' | 'invalid'> {
    return this.db.transaction(async (tx) => {
      const res = await tx.query<{ member_id: string }>(
        `SELECT member_id FROM email_verifications
         WHERE token = $1 AND used_at IS NULL AND expires_at > $2
         FOR UPDATE`,
        [token, now.toISOString()],
      );
      const row = res.rows[0];
      if (!row) return 'invalid';
      await tx.query('UPDATE email_verifications SET used_at = $2 WHERE token = $1', [token, now.toISOString()]);
      await tx.query('UPDATE members SET is_verified = TRUE, updated_at = NOW() WHERE id = $1', [row.member_id]);
      return 'ok';
    });
  }

  async findByEmail(email: string): Promise<MemberRow | undefined> {
    const res = await this.db.queryRead<MemberRow>(
      'SELECT id, email, is_verified FROM members WHERE lower(email) = lower($1)',
      [email],
    );
    return res.rows[0];
  }

  async createVerificationToken(memberId: string, token: string, expiresAt: Date): Promise<void> {
    await this.db.queryWrite(
      'INSERT INTO email_verifications (member_id, token, expires_at) VALUES ($1, $2, $3)',
      [memberId, token, expiresAt.toISOString()],
    );
  }
}
