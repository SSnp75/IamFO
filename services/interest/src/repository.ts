import type { Db, Row } from '@iamfriendof/shared';

export interface InterestAreaRow extends Row {
  id: number;
  name: string;
}

export class InterestRepository {
  constructor(private readonly db: Db) {}

  async listApproved(): Promise<InterestAreaRow[]> {
    const res = await this.db.queryRead<InterestAreaRow>(
      'SELECT id, name FROM interest_areas WHERE approved = TRUE ORDER BY name',
    );
    return res.rows;
  }

  /** Which of the given ids actually exist and are approved. */
  async existingApprovedIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const res = await this.db.queryRead<{ id: number }>(
      'SELECT id FROM interest_areas WHERE approved = TRUE AND id = ANY($1)',
      [ids],
    );
    return res.rows.map((r) => r.id);
  }

  async getMemberInterests(memberId: string): Promise<number[]> {
    const res = await this.db.queryRead<{ interest_area_id: number }>(
      'SELECT interest_area_id FROM member_interests WHERE member_id = $1',
      [memberId],
    );
    return res.rows.map((r) => r.interest_area_id);
  }

  /** Replace the member's interest selections atomically. */
  async setMemberInterests(memberId: string, interestIds: number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM member_interests WHERE member_id = $1', [memberId]);
      for (const id of interestIds) {
        await tx.query(
          'INSERT INTO member_interests (member_id, interest_area_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [memberId, id],
        );
      }
    });
  }

  async submitCustomRequest(memberId: string, label: string): Promise<number> {
    const res = await this.db.queryWrite<{ id: number }>(
      `INSERT INTO custom_interest_requests (member_id, label) VALUES ($1, $2) RETURNING id`,
      [memberId, label.trim()],
    );
    return res.rows[0]!.id;
  }
}
