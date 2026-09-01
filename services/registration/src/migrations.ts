import type { Migration } from '@iamfriendof/shared';

/**
 * Registration + Authentication schema (design "Members" section) plus the
 * Phase 0 revoked_sessions table that replaces Redis for explicit-logout /
 * lock-based session revocation (spec task 0.3).
 */
export const registrationMigrations: Migration[] = [
  {
    id: '0001_members',
    up: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS members (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name    VARCHAR(50)  NOT NULL,
        last_name     VARCHAR(50)  NOT NULL,
        email         VARCHAR(254) NOT NULL UNIQUE,
        country       VARCHAR(100) NOT NULL,
        password_hash TEXT         NOT NULL,
        is_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
        is_suspended  BOOLEAN      NOT NULL DEFAULT FALSE,
        is_private    BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_verifications (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        token      TEXT        NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS email_verifications_member_idx
        ON email_verifications(member_id);
    `,
  },
  {
    id: '0002_auth',
    up: `
      CREATE TABLE IF NOT EXISTS login_attempts (
        id           BIGSERIAL   PRIMARY KEY,
        member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        succeeded    BOOLEAN     NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_attempts_member_time_idx
        ON login_attempts(member_id, attempted_at DESC);

      CREATE TABLE IF NOT EXISTS account_locks (
        member_id    UUID        PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        locked_until TIMESTAMPTZ NOT NULL
      );

      -- Phase 0 session revocation (Redis stand-in). A row here means the token
      -- with this jti is invalid until expires_at (after which it is expired
      -- anyway and can be purged).
      CREATE TABLE IF NOT EXISTS revoked_sessions (
        jti        TEXT        PRIMARY KEY,
        member_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];
