import type { Db, Row } from '@iamfriendof/shared';

export interface CommentRow extends Row {
  id: string;
  author_id: string;
  target_type: string;
  target_id: string;
  parent_id: string | null;
  depth: number;
  body: string | null;
  is_deleted: boolean;
  moderation_status: string;
  submitted_at: string;
}

export class CommentRepository {
  constructor(private readonly db: Db) {}

  async isSuspended(memberId: string): Promise<boolean> {
    const res = await this.db.queryRead<{ is_suspended: boolean }>(
      'SELECT is_suspended FROM members WHERE id = $1',
      [memberId],
    );
    return res.rows[0]?.is_suspended ?? false;
  }

  async getParentDepth(parentId: string): Promise<number | undefined> {
    const res = await this.db.queryRead<{ depth: number }>(
      'SELECT depth FROM comments WHERE id = $1',
      [parentId],
    );
    return res.rows[0]?.depth;
  }

  async insert(input: {
    authorId: string;
    targetType: string;
    targetId: string;
    parentId: string | null;
    depth: number;
    body: string;
    moderationStatus: 'published' | 'pending';
  }): Promise<CommentRow> {
    const res = await this.db.queryWrite<CommentRow>(
      `INSERT INTO comments (author_id, target_type, target_id, parent_id, depth, body, moderation_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, author_id, target_type, target_id, parent_id, depth, body, is_deleted, moderation_status, submitted_at`,
      [
        input.authorId,
        input.targetType,
        input.targetId,
        input.parentId,
        input.depth,
        input.body,
        input.moderationStatus,
      ],
    );
    return res.rows[0]!;
  }

  async getById(id: string): Promise<CommentRow | undefined> {
    const res = await this.db.queryRead<CommentRow>('SELECT * FROM comments WHERE id = $1', [id]);
    return res.rows[0];
  }

  /** Soft-delete: null the body, mark deleted, keep submitted_at unchanged. */
  async softDelete(id: string): Promise<void> {
    await this.db.queryWrite(
      'UPDATE comments SET body = NULL, is_deleted = TRUE WHERE id = $1',
      [id],
    );
  }

  async listForTarget(targetType: string, targetId: string): Promise<CommentRow[]> {
    const res = await this.db.queryRead<CommentRow>(
      `SELECT * FROM comments
       WHERE target_type = $1 AND target_id = $2 AND moderation_status = 'published'
       ORDER BY submitted_at ASC`,
      [targetType, targetId],
    );
    return res.rows;
  }

  /** Record a report; return the number of distinct reports within the window. */
  async addReportAndCount(commentId: string, reporterId: string, windowStart: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO comment_reports (comment_id, reporter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [commentId, reporterId],
      );
      const res = await tx.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM comment_reports WHERE comment_id = $1 AND reported_at > $2',
        [commentId, windowStart.toISOString()],
      );
      return Number(res.rows[0]?.count ?? 0);
    });
  }

  async escalate(commentId: string): Promise<void> {
    await this.db.queryWrite(
      "UPDATE comments SET moderation_status = 'pending' WHERE id = $1",
      [commentId],
    );
  }
}
