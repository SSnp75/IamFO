import { runMigrations, type Db, type Migration } from '@iamfriendof/shared';
import { registrationMigrations } from '@iamfriendof/registration';
import { authenticationMigrations } from '@iamfriendof/authentication';
import { profileMigrations } from '@iamfriendof/profile';
import { interestMigrations } from '@iamfriendof/interest';
import { commentMigrations } from '@iamfriendof/comment';
import { eventMigrations } from '@iamfriendof/event';
import { pmRatingMigrations } from '@iamfriendof/pm-rating';
import { notificationMigrations } from '@iamfriendof/notification';
import { searchMigrations } from '@iamfriendof/search';

/**
 * All module migrations, aggregated in dependency order. In Phase 0 every module
 * shares one database, so migrations run together at startup. When a module is
 * extracted in Phase 1/2, its migrations travel with it and run against its own
 * database instead.
 */
export function allMigrations(): Migration[] {
  return [
    ...registrationMigrations,
    ...authenticationMigrations,
    ...profileMigrations,
    ...interestMigrations,
    ...commentMigrations,
    ...eventMigrations,
    ...pmRatingMigrations,
    ...notificationMigrations,
    ...searchMigrations,
  ];
}

/**
 * Apply pending migrations. Idempotent (see runMigrations), so it is safe to
 * call on every cold start. Returns the ids newly applied.
 */
export async function migrate(db: Db): Promise<string[]> {
  return runMigrations(db, allMigrations());
}
