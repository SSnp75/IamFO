import type { Db, Row } from '@iamfriendof/shared';

export interface ProfileRow extends Row {
  member_id: string;
  first_name: string;
  last_name: string;
  is_private: boolean;
  purpose_statement: string | null;
  profile_picture_url: string | null;
  profile_picture_alt: string | null;
}

export interface PurposeRevision extends Row {
  statement: string;
  saved_at: string;
}

export class ProfileRepository {
  constructor(private readonly db: Db) {}

  /** Join members + profiles for the public view. */
  async getProfile(memberId: string): Promise<ProfileRow | undefined> {
    const res = await this.db.queryRead<ProfileRow>(
      `SELECT m.id AS member_id, m.first_name, m.last_name, m.is_private,
              p.purpose_statement, p.profile_picture_url, p.profile_picture_alt
       FROM members m
       LEFT JOIN profiles p ON p.member_id = m.id
       WHERE m.id = $1`,
      [memberId],
    );
    return res.rows[0];
  }

  async getSkills(memberId: string): Promise<string[]> {
    const res = await this.db.queryRead<{ skill_name: string }>(
      'SELECT skill_name FROM member_skills WHERE member_id = $1 ORDER BY skill_name',
      [memberId],
    );
    return res.rows.map((r) => r.skill_name);
  }

  /**
   * Update the purpose statement and record a history entry, keeping only the
   * 3 most recent (Requirement 3.9). All in one transaction.
   */
  async updatePurpose(memberId: string, statement: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO profiles (member_id, purpose_statement, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (member_id)
         DO UPDATE SET purpose_statement = EXCLUDED.purpose_statement, updated_at = NOW()`,
        [memberId, statement],
      );
      await tx.query(
        'INSERT INTO purpose_statement_history (member_id, statement) VALUES ($1, $2)',
        [memberId, statement],
      );
      // Trim to the 3 most recent for this member.
      await tx.query(
        `DELETE FROM purpose_statement_history
         WHERE member_id = $1
           AND id NOT IN (
             SELECT id FROM purpose_statement_history
             WHERE member_id = $1
             ORDER BY saved_at DESC, id DESC
             LIMIT 3
           )`,
        [memberId],
      );
    });
  }

  async getPurposeHistory(memberId: string): Promise<PurposeRevision[]> {
    const res = await this.db.queryRead<PurposeRevision>(
      `SELECT statement, saved_at FROM purpose_statement_history
       WHERE member_id = $1 ORDER BY saved_at DESC, id DESC LIMIT 3`,
      [memberId],
    );
    return res.rows;
  }

  async setSkills(memberId: string, skills: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM member_skills WHERE member_id = $1', [memberId]);
      for (const skill of skills) {
        await tx.query(
          `INSERT INTO member_skills (member_id, skill_name) VALUES ($1, $2)
           ON CONFLICT (member_id, skill_name) DO NOTHING`,
          [memberId, skill],
        );
      }
    });
  }

  async setPrivacy(memberId: string, isPrivate: boolean): Promise<void> {
    await this.db.queryWrite('UPDATE members SET is_private = $2, updated_at = NOW() WHERE id = $1', [
      memberId,
      isPrivate,
    ]);
  }
}
