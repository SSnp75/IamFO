import type { Migration } from '@iamfriendof/shared';

/** Interest schema (design "Interest Areas" section) + seed of >=15 areas. */
export const interestMigrations: Migration[] = [
  {
    id: '0200_interests',
    up: `
      CREATE TABLE IF NOT EXISTS interest_areas (
        id        SERIAL       PRIMARY KEY,
        name      VARCHAR(80)  NOT NULL UNIQUE,
        is_custom BOOLEAN      NOT NULL DEFAULT FALSE,
        approved  BOOLEAN      NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS member_interests (
        member_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        interest_area_id INT  NOT NULL REFERENCES interest_areas(id),
        PRIMARY KEY (member_id, interest_area_id)
      );

      CREATE TABLE IF NOT EXISTS custom_interest_requests (
        id           BIGSERIAL   PRIMARY KEY,
        member_id    UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        label        VARCHAR(80) NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status       TEXT        NOT NULL DEFAULT 'pending'
      );
    `,
  },
  {
    id: '0201_seed_interests',
    up: `
      INSERT INTO interest_areas (name) VALUES
        ('Environment'), ('Education'), ('Healthcare'), ('Animal Welfare'),
        ('Disaster Relief'), ('Homelessness'), ('Food Security'), ('Elderly Care'),
        ('Youth Mentoring'), ('Arts & Culture'), ('Human Rights'), ('Community Development'),
        ('Sports & Recreation'), ('Technology Access'), ('Mental Health'), ('Refugee Support')
      ON CONFLICT (name) DO NOTHING;
    `,
  },
];
