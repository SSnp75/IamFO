import {
  FakeDb,
  InProcessBus,
  JwtSessions,
  hashPassword,
  EVENTS,
  type DomainEvent,
} from '@iamfriendof/shared';
import { AuthenticationService } from './index';

const SECRET = 'z'.repeat(40);
const PASSWORD = 'a-good-password';

async function memberRow(id = 'm1') {
  return {
    id,
    email: 'ada@example.com',
    password_hash: await hashPassword(PASSWORD, 1000),
    is_verified: true,
    is_suspended: false,
  };
}

describe('AuthenticationService', () => {
  it('issues a token on valid credentials', async () => {
    const row = await memberRow();
    const db = new FakeDb()
      .on('SELECT id, email, password_hash', () => ({ rows: [row], rowCount: 1 }))
      .on('SELECT locked_until', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO login_attempts', () => ({ rows: [], rowCount: 1 }))
      .on('DELETE FROM account_locks', () => ({ rows: [], rowCount: 0 }));
    const service = new AuthenticationService(db, new InProcessBus(), new JwtSessions(SECRET));

    const res = await service.login('ada@example.com', PASSWORD);
    expect(res.memberId).toBe('m1');
    expect(res.accessToken).toBeTruthy();
    expect(res.expiresIn).toBe(8 * 60 * 60);
  });

  it('rejects an unknown email with AUTHENTICATION_FAILED (no user enumeration)', async () => {
    const db = new FakeDb().on('SELECT id, email, password_hash', () => ({ rows: [], rowCount: 0 }));
    const service = new AuthenticationService(db, new InProcessBus(), new JwtSessions(SECRET));
    await expect(service.login('nobody@example.com', 'whatever')).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('rejects a wrong password with AUTHENTICATION_FAILED and records the attempt', async () => {
    const row = await memberRow();
    const db = new FakeDb()
      .on('SELECT id, email, password_hash', () => ({ rows: [row], rowCount: 1 }))
      .on('SELECT locked_until', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO login_attempts', () => ({ rows: [], rowCount: 1 }))
      .on('SELECT attempted_at', () => ({ rows: [], rowCount: 0 })); // few failures
    const service = new AuthenticationService(db, new InProcessBus(), new JwtSessions(SECRET));
    await expect(service.login('ada@example.com', 'wrong')).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO login_attempts'))).toBe(true);
  });

  it('locks the account and publishes member.account_locked on the 5th failure', async () => {
    const row = await memberRow();
    const now = new Date('2026-01-01T00:00:00Z');
    const nowMs = now.getTime();
    // Four prior failures within the window; the current one makes five.
    const priorFailures = Array.from({ length: 5 }, (_, i) => ({
      attempted_at: new Date(nowMs - i * 1000).toISOString(),
    }));
    const db = new FakeDb()
      .on('SELECT id, email, password_hash', () => ({ rows: [row], rowCount: 1 }))
      .on('SELECT locked_until', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO login_attempts', () => ({ rows: [], rowCount: 1 }))
      .on('SELECT attempted_at', () => ({ rows: priorFailures, rowCount: priorFailures.length }))
      .on('INSERT INTO account_locks', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const locked: DomainEvent[] = [];
    bus.subscribe(EVENTS.MEMBER_ACCOUNT_LOCKED, (e) => {
      locked.push(e);
    });
    const service = new AuthenticationService(db, bus, new JwtSessions(SECRET));

    await expect(service.login('ada@example.com', 'wrong', now)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
    expect(locked).toHaveLength(1);
    expect(locked[0]?.payload).toMatchObject({ memberId: 'm1', email: 'ada@example.com' });
  });

  it('rejects login when already locked', async () => {
    const row = await memberRow();
    const now = new Date('2026-01-01T00:00:00Z');
    const db = new FakeDb()
      .on('SELECT id, email, password_hash', () => ({ rows: [row], rowCount: 1 }))
      .on('SELECT locked_until', () => ({
        rows: [{ locked_until: new Date(now.getTime() + 10 * 60_000).toISOString() }],
        rowCount: 1,
      }));
    const service = new AuthenticationService(db, new InProcessBus(), new JwtSessions(SECRET));
    await expect(service.login('ada@example.com', PASSWORD, now)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  it('logout revokes the session and validateSession then rejects it', async () => {
    let revokedJti: string | undefined;
    const db = new FakeDb()
      .on('INSERT INTO revoked_sessions', (_sql, params) => {
        revokedJti = params[0] as string;
        return { rows: [], rowCount: 1 };
      })
      .on('SELECT EXISTS(SELECT 1 FROM revoked_sessions', () => ({
        rows: [{ exists: true }],
        rowCount: 1,
      }));
    const sessions = new JwtSessions(SECRET);
    const service = new AuthenticationService(db, new InProcessBus(), sessions);
    const { token, jti } = await sessions.issue('m1');

    await service.logout(token);
    expect(revokedJti).toBe(jti);

    await expect(service.validateSession(token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('logout is idempotent for an invalid token', async () => {
    const db = new FakeDb();
    const service = new AuthenticationService(db, new InProcessBus(), new JwtSessions(SECRET));
    await expect(service.logout('not-a-token')).resolves.toBeUndefined();
  });
});
