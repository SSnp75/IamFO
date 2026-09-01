import {
  PgDb,
  InProcessBus,
  JwtSessions,
  runMigrations,
  EVENTS,
  type Db,
  type DomainEvent,
} from '@iamfriendof/shared';
import { RegistrationService, registrationMigrations } from '@iamfriendof/registration';
import { AuthenticationService, authenticationMigrations } from '@iamfriendof/authentication';

/**
 * End-to-end integration test against a REAL Postgres, proving the SQL in the
 * repositories and migrations actually works. Requires DATABASE_URL to point at
 * a running Postgres (see tests/integration/README or docker-compose.test.yml).
 */
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET = 'integration-test-secret-key-32-characters';

// Skip gracefully if no database is configured (keeps `npm test` unit-only).
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('Registration + Authentication against real Postgres', () => {
  let db: Db;

  beforeAll(async () => {
    db = new PgDb({ writeUrl: DATABASE_URL! });
    // Clean slate for a deterministic run.
    await db.queryWrite('DROP TABLE IF EXISTS revoked_sessions, account_locks, login_attempts, email_verifications, members, schema_migrations CASCADE');
    await runMigrations(db, [...registrationMigrations, ...authenticationMigrations]);
  });

  afterAll(async () => {
    await db.close();
  });

  const uniqueEmail = () => `user_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;

  it('registers a member, verifies email, and logs in', async () => {
    const bus = new InProcessBus();
    const events: DomainEvent[] = [];
    bus.subscribe(EVENTS.MEMBER_REGISTERED, (e) => events.push(e));

    const reg = new RegistrationService(db, bus);
    const email = uniqueEmail();

    const { memberId } = await reg.register({
      firstName: 'Grace',
      lastName: 'Hopper',
      email,
      country: 'US',
      password: 'a-strong-password',
      skills: [{ name: 'Logistics', isCustom: false }],
    });
    expect(memberId).toBeTruthy();
    expect(events).toHaveLength(1);

    const token = (events[0]!.payload as { verificationToken: string }).verificationToken;
    await reg.verify(token);

    // Member is now verified; login should succeed.
    const auth = new AuthenticationService(db, bus, new JwtSessions(SECRET));
    const result = await auth.login(email, 'a-strong-password');
    expect(result.memberId).toBe(memberId);
    expect(result.accessToken).toBeTruthy();
  });

  it('rejects duplicate registration', async () => {
    const reg = new RegistrationService(db, new InProcessBus());
    const email = uniqueEmail();
    const payload = {
      firstName: 'Ada',
      lastName: 'Byron',
      email,
      country: 'UK',
      password: 'another-strong-password',
      skills: [{ name: 'Fundraising', isCustom: false }],
    };
    await reg.register(payload);
    await expect(reg.register(payload)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('locks the account after 5 failed logins and blocks the 6th', async () => {
    const bus = new InProcessBus();
    const reg = new RegistrationService(db, bus);
    const email = uniqueEmail();
    await reg.register({
      firstName: 'Lin',
      lastName: 'Tan',
      email,
      country: 'SG',
      password: 'correct-password-123',
      skills: [{ name: 'First Aid', isCustom: false }],
    });

    const auth = new AuthenticationService(db, bus, new JwtSessions(SECRET));
    const locked: DomainEvent[] = [];
    bus.subscribe(EVENTS.MEMBER_ACCOUNT_LOCKED, (e) => locked.push(e));

    for (let i = 0; i < 5; i++) {
      await expect(auth.login(email, 'wrong-password')).rejects.toBeDefined();
    }
    // Now locked; even the correct password is rejected with ACCOUNT_LOCKED.
    await expect(auth.login(email, 'correct-password-123')).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
    expect(locked.length).toBeGreaterThanOrEqual(1);
  });

  it('logout revokes the session', async () => {
    const bus = new InProcessBus();
    const reg = new RegistrationService(db, bus);
    const email = uniqueEmail();
    await reg.register({
      firstName: 'Kofi',
      lastName: 'Mensah',
      email,
      country: 'GH',
      password: 'session-test-password',
      skills: [{ name: 'Coordination', isCustom: false }],
    });

    const auth = new AuthenticationService(db, bus, new JwtSessions(SECRET));
    const { accessToken } = await auth.login(email, 'session-test-password');

    // Valid before logout.
    await expect(auth.validateSession(accessToken)).resolves.toBeDefined();
    await auth.logout(accessToken);
    // Revoked after logout.
    await expect(auth.validateSession(accessToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});
