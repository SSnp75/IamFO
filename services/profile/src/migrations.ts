import type { Migration } from '@iamfriendof/shared';

/** Profile schema (design "Profiles" section). */
export const profileMigrations: Migration[] = [
  {
    id: '0100_profiles',
    up: `
      CREATE TABLE IF NOT EXISTS profiles (
        member_id           UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        purpose_statement   TEXT,
        profile_picture_url TEXT,
        profile_picture_alt TEXT,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purpose_statement_history (
        id         BIGSERIAL   PRIMARY KEY,
        member_id  UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        statement  TEXT        NOT NULL,
        saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS purpose_history_member_idx
        ON purpose_statement_history(member_id, saved_at DESC);

      CREATE TABLE IF NOT EXISTS member_skills (
        id         BIGSERIAL    PRIMARY KEY,
        member_id  UUID         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        skill_name VARCHAR(100) NOT NULL,
        is_custom  BOOLEAN      NOT NULL DEFAULT FALSE,
        UNIQUE (member_id, skill_name)
      );
    `,
  },
];
