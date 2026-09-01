import { Pool, type PoolConfig } from 'pg';
import type { Db, QueryResult, Row, TxClient } from './Db';

export interface PgDbOptions {
  /** Primary (write) connection string. Required. */
  writeUrl: string;
  /** Optional replica (read) connection string. Falls back to writeUrl. */
  readUrl?: string;
  /** Max pool size per underlying pool. */
  max?: number;
}

/**
 * pg-backed {@link Db}. In Phase 0 both pools point at the single Neon database
 * (readUrl omitted -> reads use the write pool). In Phase 1/2 readUrl points at
 * a replica and read traffic is served there without changing any call site.
 *
 * `pg` transparently uses PgBouncer if the connection string points at it, so
 * the Phase 2 connection-pooling requirement needs no code change here.
 */
export class PgDb implements Db {
  private readonly writePool: Pool;
  private readonly readPool: Pool;

  constructor(opts: PgDbOptions) {
    if (!opts.writeUrl) throw new Error('PgDb requires a writeUrl');
    const common: Partial<PoolConfig> = { max: opts.max ?? 10 };
    this.writePool = new Pool({ connectionString: opts.writeUrl, ...common });
    this.readPool = opts.readUrl
      ? new Pool({ connectionString: opts.readUrl, ...common })
      : this.writePool;
  }

  async queryWrite<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.writePool.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  }

  async queryRead<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const res = await this.readPool.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const client = await this.writePool.connect();
    try {
      await client.query('BEGIN');
      const tx: TxClient = {
        query: async <R extends Row = Row>(sql: string, params: unknown[] = []) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.writePool.end();
    if (this.readPool !== this.writePool) await this.readPool.end();
  }
}
