import { FakeDb, InProcessBus, EVENTS, type DomainEvent } from '@iamfriendof/shared';
import { RegistrationService } from './index';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    country: 'UK',
    password: 'a-good-password',
    skills: [{ name: 'First Aid', isCustom: false }],
    ...overrides,
  };
}

describe('RegistrationService', () => {
  it('creates a member and publishes member.registered on the happy path', async () => {
    const db = new FakeDb()
      .on('SELECT EXISTS', () => ({ rows: [{ exists: false }], rowCount: 1 }))
      .on('INSERT INTO members', () => ({ rows: [{ id: 'member-1' }], rowCount: 1 }))
      .on('INSERT INTO email_verifications', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const events: DomainEvent[] = [];
    bus.subscribe(EVENTS.MEMBER_REGISTERED, (e) => {
      events.push(e);
    });

    const service = new RegistrationService(db, bus);
    const { memberId } = await service.register(validBody());

    expect(memberId).toBe('member-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ memberId: 'member-1', email: 'ada@example.com' });
    expect((events[0]?.payload as { verificationToken: string }).verificationToken).toHaveLength(64);
  });

  it('rejects a duplicate email with EMAIL_ALREADY_REGISTERED', async () => {
    const db = new FakeDb().on('SELECT EXISTS', () => ({ rows: [{ exists: true }], rowCount: 1 }));
    const service = new RegistrationService(db, new InProcessBus());
    await expect(service.register(validBody())).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  });

  it('rejects an invalid password length before touching the database', async () => {
    const db = new FakeDb();
    const service = new RegistrationService(db, new InProcessBus());
    await expect(service.register(validBody({ password: 'short' }))).rejects.toMatchObject({
      code: 'PASSWORD_LENGTH_INVALID',
    });
    expect(db.calls).toHaveLength(0);
  });

  it('verify rejects an unknown token', async () => {
    const db = new FakeDb().on('SELECT member_id FROM email_verifications', () => ({ rows: [], rowCount: 0 }));
    const service = new RegistrationService(db, new InProcessBus());
    await expect(service.verify('nope')).rejects.toMatchObject({ code: 'VERIFICATION_LINK_INVALID' });
  });

  it('verify succeeds for a valid unused token', async () => {
    const db = new FakeDb()
      .on('SELECT member_id FROM email_verifications', () => ({ rows: [{ member_id: 'm1' }], rowCount: 1 }))
      .on('UPDATE email_verifications', () => ({ rows: [], rowCount: 1 }))
      .on('UPDATE members SET is_verified', () => ({ rows: [], rowCount: 1 }));
    const service = new RegistrationService(db, new InProcessBus());
    await expect(service.verify('good-token')).resolves.toBeUndefined();
  });
});
