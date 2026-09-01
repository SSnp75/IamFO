import type { Migration } from '@iamfriendof/shared';

/** Event schema (design "Events" section). */
export const eventMigrations: Migration[] = [
  {
    id: '0400_events',
    up: `
      CREATE TABLE IF NOT EXISTS events (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        organiser_id     UUID         NOT NULL REFERENCES members(id),
        title            VARCHAR(120) NOT NULL,
        description      TEXT         NOT NULL,
        location_details VARCHAR(500),
        start_at         TIMESTAMPTZ  NOT NULL,
        end_at           TIMESTAMPTZ  NOT NULL,
        max_participants INT          NOT NULL DEFAULT 500,
        status           TEXT         NOT NULL DEFAULT 'active',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CHECK (end_at > start_at),
        CHECK (max_participants BETWEEN 1 AND 500)
      );
      CREATE INDEX IF NOT EXISTS events_start_idx ON events(start_at);

      CREATE TABLE IF NOT EXISTS event_interest_tags (
        event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        interest_area_id INT  NOT NULL REFERENCES interest_areas(id),
        PRIMARY KEY (event_id, interest_area_id)
      );

      CREATE TABLE IF NOT EXISTS event_participants (
        id                BIGSERIAL   PRIMARY KEY,
        event_id          UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        member_id         UUID        NOT NULL REFERENCES members(id),
        status            TEXT        NOT NULL DEFAULT 'confirmed',
        waitlist_position INT,
        joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (event_id, member_id)
      );
      CREATE INDEX IF NOT EXISTS participants_event_idx ON event_participants(event_id, status);

      CREATE TABLE IF NOT EXISTS attendance_confirmations (
        event_id     UUID    NOT NULL REFERENCES events(id),
        member_id    UUID    NOT NULL REFERENCES members(id),
        confirmed    BOOLEAN NOT NULL,
        confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (event_id, member_id)
      );
    `,
  },
];
