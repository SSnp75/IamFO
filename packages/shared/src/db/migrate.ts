import type { Db } from './Db';

export interface Migration {
  /** Unique, ordered id, e.g. '0001_members'. */
  id: string;
  /** SQL executed to apply the migration. */
  up: string;
}

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/**
 * Apply any migrations not yet recorded, in id order, each in its own
 * transaction. Idempotent: re-running applies only new migrations.
 */
export async function runMigrations(db: Db, migrations: Migration[]): Promise<string[]> {
  await db.queryWrite(MIGRATIONS_TABLE);
  const applied = new Set(
    (await db.queryRead<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id),
  );

  const ordered = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const newlyApplied: string[] = [];

  for (const m of ordered) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.query(m.up);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
    newlyApplied.push(m.id);
  }
  return newlyApplied;
}
