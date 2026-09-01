import { PgDb, InProcessBus, runMigrations, EVENTS, type Db } from '@iamfriendof/shared';
import { RegistrationService, registrationMigrations } from '@iamfriendof/registration';
import { authenticationMigrations } from '@iamfriendof/authentication';
import { profileMigrations, ProfileService } from '@iamfriendof/profile';
import { interestMigrations } from '@iamfriendof/interest';
import { eventMigrations } from '@iamfriendof/event';
import { pmRatingMigrations } from '@iamfriendof/pm-rating';
import { notificationMigrations } from '@iamfriendof/notification';
import { SearchService, searchMigrations } from '@iamfriendof/search';
import { AllowAllModerationFilter } from '@iamfriendof/shared';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('Search against real Postgres full-text', () => {
  let db: Db;

  beforeAll(async () => {
    db = new PgDb({ writeUrl: DATABASE_URL! });
    await db.queryWrite(
      `DROP TABLE IF EXISTS member_search_index, event_search_index,
        notifications, notification_preferences,
        pm_score_audit, self_assessments, peer_ratings, pm_scores,
        attendance_confirmations, event_participants, event_interest_tags, events,
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
      ...pmRatingMigrations,
      ...notificationMigrations,
      ...searchMigrations,
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  async function register(first: string, last: string): Promise<string> {
    const reg = new RegistrationService(db, new InProcessBus());
    const { memberId } = await reg.register({
      firstName: first,
      lastName: last,
      email: `s_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`,
      country: 'US',
      password: 'password-1234',
      skills: [{ name: 'Logistics', isCustom: false }],
    });
    return memberId;
  }

  it('indexes members on member.updated and searches with private exclusion + ranking', async () => {
    const bus = new InProcessBus();
    const search = new SearchService(db, bus);
    search.registerConsumers();
    const profile = new ProfileService(db, bus, new AllowAllModerationFilter());

    // Two members named to test exact-vs-partial: "Sam" (exact) and "Sammy".
    const sam = await register('Sam', 'Rivera');
    const sammy = await register('Sammy', 'Lee');
    const hidden = await register('Sam', 'Secret');

    // Trigger indexing via member.updated (profile update publishes it).
    await profile.updateSkills(sam, ['Logistics']);
    await profile.updateSkills(sammy, ['Logistics']);
    await profile.updateSkills(hidden, ['Logistics']);
    // Make the third member private -> must be excluded from results.
    await profile.setPrivacy(hidden, true);

    const results = await search.searchMembers('Sam');
    const ids = results.map((r) => r.memberId);

    // Private "Sam Secret" excluded.
    expect(ids).not.toContain(hidden);
    // Both Sam and Sammy present; exact-first-name "Sam Rivera" ranks before "Sammy Lee".
    expect(ids).toContain(sam);
    expect(ids).toContain(sammy);
    expect(ids.indexOf(sam)).toBeLessThan(ids.indexOf(sammy));
  });

  it('rejects an over-long query', async () => {
    const search = new SearchService(db, new InProcessBus());
    await expect(search.searchMembers('x'.repeat(101))).rejects.toMatchObject({
      code: 'SEARCH_QUERY_TOO_LONG',
    });
  });
});
