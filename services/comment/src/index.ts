import {
  AppError,
  ERROR_CODES,
  EVENTS,
  DenyListModerationFilter,
  type Db,
  type MessageBus,
  type ModerationFilter,
} from '@iamfriendof/shared';
import { CommentRepository, type CommentRow } from './repository';
import {
  assertValidCommentLength,
  nextDepth,
  DELETED_MARKER,
  REPORT_THRESHOLD,
  REPORT_WINDOW_MS,
} from './rules';

export { commentMigrations } from './migrations';
export * from './rules';

export interface CreateCommentInput {
  authorId: string;
  targetType: 'event' | 'profile';
  targetId: string;
  parentId?: string | null;
  body: string;
}

export interface CommentView {
  id: string;
  authorId: string;
  body: string;
  depth: number;
  submittedAt: string;
  isDeleted: boolean;
  moderationStatus: string;
}

/** Map a DB row to the view, applying the "Removed by author" marker. */
export function toView(row: CommentRow): CommentView {
  return {
    id: row.id,
    authorId: row.author_id,
    depth: row.depth,
    submittedAt: row.submitted_at,
    isDeleted: row.is_deleted,
    moderationStatus: row.moderation_status,
    body: row.is_deleted ? DELETED_MARKER : row.body ?? '',
  };
}

export class CommentService {
  private readonly repo: CommentRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly moderation: ModerationFilter = new DenyListModerationFilter(),
  ) {
    this.repo = new CommentRepository(db);
  }

  async create(input: CreateCommentInput): Promise<{ comment: CommentView }> {
    assertValidCommentLength(input.body);

    if (await this.repo.isSuspended(input.authorId)) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Suspended accounts cannot post comments', 403);
    }

    // Resolve nesting depth from the parent (if any).
    let depth = 0;
    if (input.parentId) {
      const parentDepth = await this.repo.getParentDepth(input.parentId);
      if (parentDepth === undefined) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Parent comment not found', 404);
      }
      depth = nextDepth(parentDepth); // throws NESTING_DEPTH_EXCEEDED if too deep
    }

    // Moderation gate: flagged content is held pending, not published.
    const verdict = await this.moderation.check(input.body);
    const moderationStatus = verdict.flagged ? 'pending' : 'published';

    const row = await this.repo.insert({
      authorId: input.authorId,
      targetType: input.targetType,
      targetId: input.targetId,
      parentId: input.parentId ?? null,
      depth,
      body: input.body,
      moderationStatus,
    });

    if (moderationStatus === 'published') {
      await this.bus.publish(EVENTS.COMMENT_POSTED, {
        commentId: row.id,
        targetType: input.targetType,
        targetId: input.targetId,
        authorId: input.authorId,
      });
    }

    return { comment: toView(row) };
  }

  /** Author soft-deletes their own comment (Requirement 6.5). */
  async deleteOwn(commentId: string, requesterId: string): Promise<void> {
    const row = await this.repo.getById(commentId);
    if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Comment not found', 404);
    if (row.author_id !== requesterId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'You may only delete your own comments', 403);
    }
    await this.repo.softDelete(commentId);
  }

  async listForTarget(targetType: string, targetId: string): Promise<CommentView[]> {
    const rows = await this.repo.listForTarget(targetType, targetId);
    return rows.map(toView);
  }

  /**
   * Report a comment. When distinct reports within 24h reach the threshold,
   * escalate to the moderation queue (Requirement 12.5).
   */
  async report(commentId: string, reporterId: string, now: Date = new Date()): Promise<{ escalated: boolean }> {
    const windowStart = new Date(now.getTime() - REPORT_WINDOW_MS);
    const count = await this.repo.addReportAndCount(commentId, reporterId, windowStart);
    if (count >= REPORT_THRESHOLD) {
      await this.repo.escalate(commentId);
      return { escalated: true };
    }
    return { escalated: false };
  }
}
