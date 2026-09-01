import {
  FakeDb,
  InProcessBus,
  AllowAllModerationFilter,
  DenyListModerationFilter,
  EVENTS,
  type DomainEvent,
} from '@iamfriendof/shared';
import { CommentService } from './index';

function insertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    author_id: 'a1',
    target_type: 'event',
    target_id: 't1',
    parent_id: null,
    depth: 0,
    body: 'hi',
    is_deleted: false,
    moderation_status: 'published',
    submitted_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CommentService', () => {
  it('rejects an empty comment', async () => {
    const service = new CommentService(new FakeDb(), new InProcessBus(), new AllowAllModerationFilter());
    await expect(
      service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', body: '' }),
    ).rejects.toMatchObject({ code: 'COMMENT_EMPTY' });
  });

  it('rejects an over-long comment', async () => {
    const service = new CommentService(new FakeDb(), new InProcessBus(), new AllowAllModerationFilter());
    await expect(
      service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', body: 'x'.repeat(1001) }),
    ).rejects.toMatchObject({ code: 'COMMENT_TOO_LONG' });
  });

  it('rejects a comment from a suspended member', async () => {
    const db = new FakeDb().on('SELECT is_suspended FROM members', () => ({
      rows: [{ is_suspended: true }],
      rowCount: 1,
    }));
    const service = new CommentService(db, new InProcessBus(), new AllowAllModerationFilter());
    await expect(
      service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', body: 'hello' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('publishes comment.posted on a clean published comment', async () => {
    const db = new FakeDb()
      .on('SELECT is_suspended FROM members', () => ({ rows: [{ is_suspended: false }], rowCount: 1 }))
      .on('INSERT INTO comments', () => ({ rows: [insertRow()], rowCount: 1 }));
    const bus = new InProcessBus();
    const posted: DomainEvent[] = [];
    bus.subscribe(EVENTS.COMMENT_POSTED, (e) => posted.push(e));
    const service = new CommentService(db, bus, new AllowAllModerationFilter());

    const { comment } = await service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', body: 'hello' });
    expect(comment.body).toBe('hi');
    expect(posted).toHaveLength(1);
  });

  it('holds a flagged comment as pending and does NOT publish', async () => {
    const db = new FakeDb()
      .on('SELECT is_suspended FROM members', () => ({ rows: [{ is_suspended: false }], rowCount: 1 }))
      .on('INSERT INTO comments', () => ({ rows: [insertRow({ moderation_status: 'pending' })], rowCount: 1 }));
    const bus = new InProcessBus();
    const posted: DomainEvent[] = [];
    bus.subscribe(EVENTS.COMMENT_POSTED, (e) => posted.push(e));
    const service = new CommentService(db, bus, new DenyListModerationFilter(['spamword']));
    await service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', body: 'buy spamword now' });
    expect(posted).toHaveLength(0);
  });

  it('rejects a reply that would exceed depth 2', async () => {
    const db = new FakeDb()
      .on('SELECT is_suspended FROM members', () => ({ rows: [{ is_suspended: false }], rowCount: 1 }))
      .on('SELECT depth FROM comments WHERE id', () => ({ rows: [{ depth: 2 }], rowCount: 1 }));
    const service = new CommentService(db, new InProcessBus(), new AllowAllModerationFilter());
    await expect(
      service.create({ authorId: 'a1', targetType: 'event', targetId: 't1', parentId: 'p1', body: 'deep reply' }),
    ).rejects.toMatchObject({ code: 'NESTING_DEPTH_EXCEEDED' });
  });

  it('soft-deletes only the author\'s own comment', async () => {
    const db = new FakeDb()
      .on('SELECT * FROM comments WHERE id', () => ({ rows: [insertRow({ author_id: 'a1' })], rowCount: 1 }))
      .on('UPDATE comments SET body = NULL', () => ({ rows: [], rowCount: 1 }));
    const service = new CommentService(db, new InProcessBus(), new AllowAllModerationFilter());
    await expect(service.deleteOwn('c1', 'someone-else')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(service.deleteOwn('c1', 'a1')).resolves.toBeUndefined();
  });

  it('escalates a comment at the 3rd report within 24h', async () => {
    const db = new FakeDb()
      .on('INSERT INTO comment_reports', () => ({ rows: [], rowCount: 1 }))
      .on('SELECT COUNT(*) AS count FROM comment_reports', () => ({ rows: [{ count: '3' }], rowCount: 1 }))
      .on("UPDATE comments SET moderation_status = 'pending'", () => ({ rows: [], rowCount: 1 }));
    const service = new CommentService(db, new InProcessBus(), new AllowAllModerationFilter());
    const res = await service.report('c1', 'r3');
    expect(res.escalated).toBe(true);
  });

  it('does not escalate below the report threshold', async () => {
    const db = new FakeDb()
      .on('INSERT INTO comment_reports', () => ({ rows: [], rowCount: 1 }))
      .on('SELECT COUNT(*) AS count FROM comment_reports', () => ({ rows: [{ count: '2' }], rowCount: 1 }));
    const service = new CommentService(db, new InProcessBus(), new AllowAllModerationFilter());
    const res = await service.report('c1', 'r2');
    expect(res.escalated).toBe(false);
  });
});
