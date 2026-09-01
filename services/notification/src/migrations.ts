import type { Migration } from '@iamfriendof/shared';

/** Notification schema (design "Notifications" section). */
export const notificationMigrations: Migration[] = [
  {
    id: '0600_notifications',
    up: `
      CREATE TABLE IF NOT EXISTS notifications (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        type            TEXT        NOT NULL,
        summary         TEXT        NOT NULL,
        is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
        triggered_at    TIMESTAMPTZ NOT NULL,
        delivered_at    TIMESTAMPTZ,
        delivery_failed BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notifications_member_idx
        ON notifications(member_id, triggered_at DESC);

      CREATE TABLE IF NOT EXISTS notification_preferences (
        member_id      UUID   PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        disabled_types TEXT[] NOT NULL DEFAULT '{}'
      );
    `,
  },
];
