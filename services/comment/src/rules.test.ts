import fc from 'fast-check';
import {
  isValidCommentLength,
  nextDepth,
  canReplyTo,
  COMMENT_MAX,
  MAX_DEPTH,
} from './rules';
import { toView } from './index';
import type { CommentRow } from './repository';

describe('Comment rules', () => {
  // Feature: iamfriendof-volunteer-network, Property 13: Comment length controls acceptance
  it('Property 13: accepts a comment iff length in [1, 1000]', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1200 }), (body) => {
        expect(isValidCommentLength(body)).toBe(body.length >= 1 && body.length <= COMMENT_MAX);
      }),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 15: Reply nesting depth enforced at depth 2
  it('Property 15: a reply is accepted iff parent depth <= 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (parentDepth) => {
        const allowed = canReplyTo(parentDepth);
        expect(allowed).toBe(parentDepth <= MAX_DEPTH - 1);
        if (allowed) {
          expect(nextDepth(parentDepth)).toBe(parentDepth + 1);
        } else {
          expect(() => nextDepth(parentDepth)).toThrow();
        }
      }),
    );
  });

  it('root comment (no parent) has depth 0', () => {
    expect(nextDepth(null)).toBe(0);
  });
});

describe('toView (Property 14: deleted marker + timestamp preserved)', () => {
  function row(overrides: Partial<CommentRow> = {}): CommentRow {
    return {
      id: 'c1',
      author_id: 'a1',
      target_type: 'event',
      target_id: 't1',
      parent_id: null,
      depth: 0,
      body: 'original text',
      is_deleted: false,
      moderation_status: 'published',
      submitted_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // Feature: iamfriendof-volunteer-network, Property 14: Deleted comments show replacement text with original timestamp
  it('Property 14: any deleted comment shows "Removed by author" with the original timestamp', () => {
    fc.assert(
      fc.property(
        fc.record({
          body: fc.option(fc.string(), { nil: null }),
          submitted: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        }),
        ({ body, submitted }) => {
          const ts = submitted.toISOString();
          const view = toView(row({ is_deleted: true, body, submitted_at: ts }));
          expect(view.body).toBe('Removed by author');
          expect(view.submittedAt).toBe(ts);
        },
      ),
    );
  });

  it('non-deleted comment shows its original body', () => {
    const view = toView(row({ is_deleted: false, body: 'hello' }));
    expect(view.body).toBe('hello');
  });
});
