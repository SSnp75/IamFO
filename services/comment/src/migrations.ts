import type { Migration } from '@iamfriendof/shared';

/** Comment schema (design "Comments" section). */
export const commentMigrations: Migration[] = [
  {
    id: '0300_comments',
    up: `
      CREATE TABLE IF NOT EXISTS comments (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id         UUID        NOT NULL REFERENCES members(id),
        target_type       TEXT        NOT NULL,
        target_id         UUID        NOT NULL,
        parent_id         UUID        REFERENCES comments(id),
        depth             INT         NOT NULL DEFAULT 0,
        body              TEXT,
        is_deleted        BOOLEAN     NOT NULL DEFAULT FALSE,
        moderation_status TEXT        NOT NULL DEFAULT 'published',
        submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (depth BETWEEN 0 AND 2)
      );
      CREATE INDEX IF NOT EXISTS comments_target_idx
        ON comments(target_type, target_id, submitted_at);

      CREATE TABLE IF NOT EXISTS comment_reports (
        id           BIGSERIAL   PRIMARY KEY,
        comment_id   UUID        NOT NULL REFERENCES comments(id),
        reporter_id  UUID        NOT NULL REFERENCES members(id),
        reported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (comment_id, reporter_id)
      );
    `,
  },
];
