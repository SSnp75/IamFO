import type { Migration } from '@iamfriendof/shared';

/** PM Rating schema (design "PM Ratings" section). */
export const pmRatingMigrations: Migration[] = [
  {
    id: '0500_pm_ratings',
    up: `
      CREATE TABLE IF NOT EXISTS pm_scores (
        member_id            UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        score                NUMERIC(5,2),
        events_organised     INT     NOT NULL DEFAULT 0,
        completion_rate      NUMERIC(5,2),
        avg_peer_rating      NUMERIC(3,2),
        self_assessment_band TEXT,
        pending_update       BOOLEAN NOT NULL DEFAULT FALSE,
        last_calculated_at   TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS peer_ratings (
        id                        BIGSERIAL   PRIMARY KEY,
        event_id                  UUID        NOT NULL REFERENCES events(id),
        rater_id                  UUID        NOT NULL REFERENCES members(id),
        organiser_id              UUID        NOT NULL REFERENCES members(id),
        numeric_rating            SMALLINT    NOT NULL CHECK (numeric_rating BETWEEN 1 AND 5),
        written_comment           TEXT,
        comment_moderation_status TEXT        NOT NULL DEFAULT 'published',
        submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (event_id, rater_id)
      );

      CREATE TABLE IF NOT EXISTS self_assessments (
        id           BIGSERIAL   PRIMARY KEY,
        member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        responses    JSONB       NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pm_score_audit (
        id             BIGSERIAL   PRIMARY KEY,
        member_id      UUID        NOT NULL REFERENCES members(id),
        input_type     TEXT        NOT NULL,
        input_value    TEXT        NOT NULL,
        contributor_id UUID        NOT NULL REFERENCES members(id),
        recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];
