import {
  PgDb,
  InProcessBus,
  AllowAllModerationFilter,
  runMigrations,
  type Db,
} from '@iamfriendof/shared';
import { RegistrationService, registrationMigrations } from '@iamfriendof/registration';
import { authenticationMigrations } from '@iamfriendof/authentication';
import { ProfileService, profileMigrations } from '@iamfriendof/profile';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('Profile against real Postgres', () => {
  let db: Db;

  beforeAll(async () => {
    db = new PgDb({ writeUrl: DATABASE_URL! });
    await db.queryWrite(
      'DROP TABLE IF EXISTS member_skills, purpose_statement_history, profiles, revoked_sessions, account_locks, login_attempts, email_verifications, members, schema_migrations CASCADE',
    );
    await runMigrations(db, [...registrationMigrations, ...authenticationMigrations, ...profileMigrations]);
  });

  afterAll(async () => {
    await db.close();
  });

  async function newMember(): Promise<string> {
    const reg = new RegistrationService(db, new InProcessBus());
    const email = `p_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const { memberId } = await reg.register({
      firstName: 'Pat',
      lastName: 'Kim',
      email,
      country: 'KR',
      password: 'password-1234',
      skills: [{ name: 'Planning', isCustom: false }],
    });
    return memberId;
  }

  // Feature: iamfriendof-volunteer-network, Property 7: history retains exactly the 3 most recent
  it('Property 7: purpose history keeps exactly the 3 most recent versions', async () => {
    const memberId = await newMember();
    const profile = new ProfileService(db, new InProcessBus(), new AllowAllModerationFilter());

    for (let i = 1; i <= 6; i++) {
      await profile.updatePurpose(memberId, `Statement number ${i}`);
    }

    const history = await profile.getPurposeHistory(memberId);
    expect(history).toHaveLength(3);
    // Most recent first: 6, 5, 4.
    expect(history.map((h) => h.statement)).toEqual([
      'Statement number 6',
      'Statement number 5',
      'Statement number 4',
    ]);
  });

  it('privacy filter hides fields for private profiles end-to-end', async () => {
    const memberId = await newMember();
    const profile = new ProfileService(db, new InProcessBus(), new AllowAllModerationFilter());
    await profile.updatePurpose(memberId, 'Public purpose');
    await profile.updateSkills(memberId, ['First Aid', 'Logistics']);

    const before = await profile.getPublicProfile(memberId);
    expect(before.isPrivate).toBe(false);
    expect(before.skills).toEqual(['First Aid', 'Logistics']);

    await profile.setPrivacy(memberId, true);
    const after = await profile.getPublicProfile(memberId);
    expect(after.isPrivate).toBe(true);
    expect(after.lastName).toBeUndefined();
    expect(after.skills).toBeUndefined();
    expect(after.purposeStatement).toBeUndefined();
  });
});
