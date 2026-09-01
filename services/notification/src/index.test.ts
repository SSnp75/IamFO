import { FakeDb, InProcessBus, EVENTS } from '@iamfriendof/shared';
import { NotificationService, NOTIFICATION_TYPES } from './index';
import { InMemoryEmailSender } from './emailSender';

describe('NotificationService', () => {
  it('does not deliver when the member has opted out of the type', async () => {
    const db = new FakeDb().on('SELECT disabled_types FROM notification_preferences', () => ({
      rows: [{ disabled_types: [NOTIFICATION_TYPES.PM_SCORE_UPDATED] }],
      rowCount: 1,
    }));
    const service = new NotificationService(db, new InProcessBus(), new InMemoryEmailSender());
    const result = await service.deliver({
      memberId: 'm1',
      type: NOTIFICATION_TYPES.PM_SCORE_UPDATED,
      summary: 'score updated',
    });
    expect(result.delivered).toBe(false);
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO notifications'))).toBe(false);
  });

  it('delivers an in-platform notification when not opted out', async () => {
    const db = new FakeDb()
      .on('SELECT disabled_types FROM notification_preferences', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO notifications', () => ({ rows: [{ id: 'n1' }], rowCount: 1 }));
    const service = new NotificationService(db, new InProcessBus(), new InMemoryEmailSender());
    const result = await service.deliver({
      memberId: 'm1',
      type: NOTIFICATION_TYPES.WAITLIST_PROMOTED,
      summary: 'promoted',
    });
    expect(result.delivered).toBe(true);
    expect(result.notificationId).toBe('n1');
  });

  it('sends an email and retries once on failure, marking delivery_failed if both fail', async () => {
    const db = new FakeDb()
      .on('SELECT disabled_types FROM notification_preferences', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO notifications', () => ({ rows: [{ id: 'n1' }], rowCount: 1 }))
      .on('SELECT email FROM members WHERE id', () => ({ rows: [{ email: 'a@b.com' }], rowCount: 1 }))
      .on('UPDATE notifications SET delivery_failed = TRUE', () => ({ rows: [], rowCount: 1 }));
    const email = new InMemoryEmailSender();
    email.failNext(2); // both attempts fail
    const service = new NotificationService(db, new InProcessBus(), email);
    await service.deliver({
      memberId: 'm1',
      type: NOTIFICATION_TYPES.ACCOUNT_LOCKED,
      summary: 'locked',
      sendEmail: true,
    });
    expect(db.calls.some((c) => c.sql.includes('UPDATE notifications SET delivery_failed = TRUE'))).toBe(true);
  });

  it('succeeds on the retry when the first email attempt fails', async () => {
    const db = new FakeDb()
      .on('SELECT disabled_types FROM notification_preferences', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO notifications', () => ({ rows: [{ id: 'n1' }], rowCount: 1 }))
      .on('SELECT email FROM members WHERE id', () => ({ rows: [{ email: 'a@b.com' }], rowCount: 1 }));
    const email = new InMemoryEmailSender();
    email.failNext(1); // first fails, retry succeeds
    const service = new NotificationService(db, new InProcessBus(), email);
    await service.deliver({ memberId: 'm1', type: NOTIFICATION_TYPES.ACCOUNT_LOCKED, summary: 'locked', sendEmail: true });
    expect(email.sent).toHaveLength(1);
    expect(db.calls.some((c) => c.sql.includes('delivery_failed = TRUE'))).toBe(false);
  });

  it('returns 50 most recent with unread count', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      type: 'x',
      summary: 's',
      is_read: false,
      triggered_at: new Date().toISOString(),
      delivery_failed: false,
    }));
    const db = new FakeDb()
      // Order matters: FakeDb returns the first responder whose substring matches.
      // Register the COUNT responder first so it is not shadowed by the list query.
      .on('SELECT COUNT(*) AS count FROM notifications', () => ({ rows: [{ count: '7' }], rowCount: 1 }))
      .on('id, type, summary, is_read, triggered_at, delivery_failed', () => ({ rows, rowCount: rows.length }));
    const service = new NotificationService(db, new InProcessBus(), new InMemoryEmailSender());
    const res = await service.getNotifications('m1');
    expect(res.notifications).toHaveLength(50);
    expect(res.unreadCount).toBe(7);
  });

  it('consumer publishes an in-platform notification on participant.promoted', async () => {
    const db = new FakeDb()
      .on('SELECT disabled_types FROM notification_preferences', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO notifications', () => ({ rows: [{ id: 'n1' }], rowCount: 1 }))
      .on('SELECT email FROM members WHERE id', () => ({ rows: [{ email: 'a@b.com' }], rowCount: 1 }));
    const bus = new InProcessBus();
    const service = new NotificationService(db, bus, new InMemoryEmailSender());
    service.registerConsumers();
    await bus.publish(EVENTS.PARTICIPANT_PROMOTED, { eventId: 'e1', memberId: 'm1' });
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO notifications'))).toBe(true);
  });
});
