import type { Db, Row } from '@iamfriendof/shared';

export interface NotificationRow extends Row {
  id: string;
  type: string;
  summary: string;
  is_read: boolean;
  triggered_at: string;
  delivery_failed: boolean;
}

export class NotificationRepository {
  constructor(private readonly db: Db) {}

  async getDisabledTypes(memberId: string): Promise<string[]> {
    const res = await this.db.queryRead<{ disabled_types: string[] }>(
      'SELECT disabled_types FROM notification_preferences WHERE member_id = $1',
      [memberId],
    );
    return res.rows[0]?.disabled_types ?? [];
  }

  async insert(input: {
    memberId: string;
    type: string;
    summary: string;
    triggeredAt: Date;
    deliveryFailed: boolean;
  }): Promise<string> {
    const res = await this.db.queryWrite<{ id: string }>(
      `INSERT INTO notifications (member_id, type, summary, triggered_at, delivered_at, delivery_failed)
       VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING id`,
      [input.memberId, input.type, input.summary, input.triggeredAt.toISOString(), input.deliveryFailed],
    );
    return res.rows[0]!.id;
  }

  async markDeliveryFailed(id: string): Promise<void> {
    await this.db.queryWrite('UPDATE notifications SET delivery_failed = TRUE WHERE id = $1', [id]);
  }

  /** 50 most recent notifications for a member, newest first. */
  async listRecent(memberId: string): Promise<NotificationRow[]> {
    const res = await this.db.queryRead<NotificationRow>(
      `SELECT id, type, summary, is_read, triggered_at, delivery_failed
       FROM notifications WHERE member_id = $1
       ORDER BY triggered_at DESC, created_at DESC LIMIT 50`,
      [memberId],
    );
    return res.rows;
  }

  async unreadCount(memberId: string): Promise<number> {
    const res = await this.db.queryRead<{ count: string }>(
      'SELECT COUNT(*) AS count FROM notifications WHERE member_id = $1 AND is_read = FALSE',
      [memberId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  async markRead(id: string, memberId: string): Promise<void> {
    await this.db.queryWrite('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND member_id = $2', [
      id,
      memberId,
    ]);
  }

  async setPreferences(memberId: string, disabledTypes: string[]): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO notification_preferences (member_id, disabled_types) VALUES ($1, $2)
       ON CONFLICT (member_id) DO UPDATE SET disabled_types = EXCLUDED.disabled_types`,
      [memberId, disabledTypes],
    );
  }

  async getMemberEmail(memberId: string): Promise<string | undefined> {
    const res = await this.db.queryRead<{ email: string }>('SELECT email FROM members WHERE id = $1', [memberId]);
    return res.rows[0]?.email;
  }
}
