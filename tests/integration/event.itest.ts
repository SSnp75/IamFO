import {
  PgDb,
  InProcessBus,
  runMigrations,
  EVENTS,
  type Db,
  type DomainEvent,
} from '@iamfriendof/shared';
import { RegistrationService, registrationMigrations } from '@iamfriendof/registration';
import { authenticationMigrations } from '@iamfriendof/authentication';
import { profileMigrations } from '@iamfriendof/profile';
import { interestMigrations } from '@iamfriendof/interest';
import { EventService, eventMigrations } from '@iamfriendof/event';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('Event join/waitlist/promotion against real Postgres', () => {
  let db: Db;

  beforeAll(async () => {
    db = new PgDb({ writeUrl: DATABASE_URL! });
    await db.queryWrite(
      `DROP TABLE IF EXISTS attendance_confirmations, event_participants, event_interest_tags, events,
        member_interests, custom_interest_requests, interest_areas,
        member_skills, purpose_statement_history, profiles,
        revoked_sessions, account_locks, login_attempts, email_verifications, members,
        schema_migrations CASCADE`,
    );
    await runMigrations(db, [
      ...registrationMigrations,
      ...authenticationMigrations,
      ...profileMigrations,
      ...interestMigrations,
      ...eventMigrations,
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  let counter = 0;
  async function member(): Promise<string> {
    counter += 1;
    const reg = new RegistrationService(db, new InProcessBus());
    const { memberId } = await reg.register({
      firstName: 'M',
      lastName: `N${counter}`,
      email: `ev_${Date.now()}_${counter}@example.com`,
      country: 'US',
      password: 'password-1234',
      skills: [{ name: 'Logistics', isCustom: false }],
    });
    return memberId;
  }

  const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const FUTURE_END = new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString();

  it('confirms up to capacity, waitlists beyond, and promotes on withdrawal', async () => {
    const organiser = await member();
    const bus = new InProcessBus();
    const promoted: DomainEvent[] = [];
    bus.subscribe(EVENTS.PARTICIPANT_PROMOTED, (e) => promoted.push(e));
    const events = new EventService(db, bus);

    // Capacity of 1 to make waitlisting easy to observe.
    const { eventId } = await events.create({
      organiserId: organiser,
      title: 'Small Event',
      description: 'Only one confirmed spot',
      startAt: FUTURE,
      endAt: FUTURE_END,
      maxParticipants: 1,
      interestIds: [1],
    });

    const a = await member();
    const b = await member();

    const first = await events.join(eventId, a);
    expect(first.status).toBe('confirmed');

    const second = await events.join(eventId, b);
    expect(second.status).toBe('waitlisted');
    if (second.status === 'waitlisted') expect(second.position).toBe(1);

    // Counts reflect 1 confirmed + 1 waitlisted.
    const before = await events.getWithCounts(eventId);
    expect(before.confirmed).toBe(1);
    expect(before.waitlisted).toBe(1);

    // A withdraws -> B is promoted to confirmed.
    await events.withdraw(eventId, a);
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.payload).toMatchObject({ eventId, memberId: b });

    const after = await events.getWithCounts(eventId);
    expect(after.confirmed).toBe(1); // B now confirmed
    expect(after.waitlisted).toBe(0);
  });

  it('is idempotent when the same member joins twice', async () => {
    const organiser = await member();
    const events = new EventService(db, new InProcessBus());
    const { eventId } = await events.create({
      organiserId: organiser,
      title: 'Dedupe Event',
      description: 'Joining twice should not double-count',
      startAt: FUTURE,
      endAt: FUTURE_END,
      maxParticipants: 10,
      interestIds: [1],
    });
    const a = await member();
    expect((await events.join(eventId, a)).status).toBe('confirmed');
    expect((await events.join(eventId, a)).status).toBe('already_joined');
    const counts = await events.getWithCounts(eventId);
    expect(counts.confirmed).toBe(1);
  });
});
