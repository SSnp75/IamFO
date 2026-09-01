import type { Migration } from '@iamfriendof/shared';

/** Search index schema (design "Search Index" section) — Postgres FTS for Phase 0. */
export const searchMigrations: Migration[] = [
  {
    id: '0700_search_index',
    up: `
      CREATE TABLE IF NOT EXISTS member_search_index (
        member_id      UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        display_name   TEXT    NOT NULL,
        is_private     BOOLEAN NOT NULL DEFAULT FALSE,
        skills_text    TEXT,
        interests_text TEXT,
        search_vector  TSVECTOR GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(display_name, '') || ' ' ||
            coalesce(skills_text, '') || ' ' ||
            coalesce(interests_text, ''))
        ) STORED
      );
      CREATE INDEX IF NOT EXISTS member_search_gin ON member_search_index USING GIN (search_vector);

      CREATE TABLE IF NOT EXISTS event_search_index (
        event_id       UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        description    TEXT,
        interests_text TEXT,
        start_at       TIMESTAMPTZ,
        search_vector  TSVECTOR GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(interests_text, ''))
        ) STORED
      );
      CREATE INDEX IF NOT EXISTS event_search_gin ON event_search_index USING GIN (search_vector);
    `,
  },
];
