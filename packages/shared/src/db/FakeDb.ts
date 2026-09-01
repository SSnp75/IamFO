import type { Db, QueryResult, Row, TxClient } from './Db';

/**
 * A minimal in-memory Db used for unit tests that need to exercise repository
 * flows without a real Postgres. It does NOT interpret SQL; instead a test
 * registers responders keyed by a substring of the SQL. This keeps tests
 * focused on service logic (ordering of calls, event publication) rather than
 * SQL execution, which is covered by integration tests against real Postgres.
 */
export type Responder = (sql: string, params: unknown[]) => QueryResult<Row>;

export class FakeDb implements Db {
  private readonly responders: Array<{ match: string; respond: Responder }> = [];
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];

  /** Register a responder for any query whose SQL contains `match`. */
  on(match: string, respond: Responder): this {
    this.responders.push({ match, respond });
    return this;
  }

  private run<T extends Row>(sql: string, params: unknown[]): QueryResult<T> {
    this.calls.push({ sql, params });
    const normalised = sql.replace(/\s+/g, ' ').trim();
    for (const r of this.responders) {
      if (normalised.includes(r.match)) return r.respond(normalised, params) as QueryResult<T>;
    }
    return { rows: [], rowCount: 0 };
  }

  async queryWrite<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.run<T>(sql, params);
  }

  async queryRead<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.run<T>(sql, params);
  }

  async transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const tx: TxClient = {
      query: async <R extends Row = Row>(sql: string, params: unknown[] = []) => this.run<R>(sql, params),
    };
    return fn(tx);
  }

  async close(): Promise<void> {
    /* no-op */
  }
}
