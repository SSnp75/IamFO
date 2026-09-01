import type { Migration } from '@iamfriendof/shared';

/**
 * Authentication shares the members/auth schema with Registration in Phase 0
 * (single database), so those tables (members, login_attempts, account_locks,
 * revoked_sessions) are created by the registration migrations. This array is
 * intentionally empty as a placeholder; when Authentication is extracted to its
 * own service and database in Phase 1/2, the auth-owned tables move here.
 */
export const authenticationMigrations: Migration[] = [];
