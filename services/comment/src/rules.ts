import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const COMMENT_MIN = 1;
export const COMMENT_MAX = 1000;
export const MAX_DEPTH = 2;
export const DELETED_MARKER = 'Removed by author';
export const REPORT_THRESHOLD = 3;
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Comment length validity (Requirement 6.2/6.3): 1–1000 chars. */
export function isValidCommentLength(body: string): boolean {
  return body.length >= COMMENT_MIN && body.length <= COMMENT_MAX;
}

export function assertValidCommentLength(body: string): void {
  if (body.length < COMMENT_MIN) {
    throw new AppError(ERROR_CODES.COMMENT_EMPTY, 'A comment cannot be empty', 422, {
      length: body.length,
      min: COMMENT_MIN,
      max: COMMENT_MAX,
    });
  }
  if (body.length > COMMENT_MAX) {
    throw new AppError(ERROR_CODES.COMMENT_TOO_LONG, `A comment must be at most ${COMMENT_MAX} characters`, 422, {
      length: body.length,
      min: COMMENT_MIN,
      max: COMMENT_MAX,
    });
  }
}

/**
 * Depth of a reply given its parent's depth (Requirement 6.7). A root comment
 * has depth 0; a reply is parent.depth + 1. Replies beyond depth 2 are rejected,
 * i.e. a reply is allowed iff the parent's depth <= 1.
 */
export function nextDepth(parentDepth: number | null): number {
  if (parentDepth === null) return 0;
  if (parentDepth >= MAX_DEPTH) {
    throw new AppError(
      ERROR_CODES.NESTING_DEPTH_EXCEEDED,
      'Replies cannot be nested more than two levels deep',
      422,
    );
  }
  return parentDepth + 1;
}

/** Whether a reply to a comment at parentDepth is permitted. */
export function canReplyTo(parentDepth: number): boolean {
  return parentDepth <= MAX_DEPTH - 1;
}
