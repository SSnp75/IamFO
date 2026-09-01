/** A single row is an object keyed by column name. */
export type Row = Record<string, unknown>;

/** Result of a query: the rows and the number affected/returned. */
export interface QueryResult<T extends Row = Row> {
  rows: T[];
  rowCount: number;
}

/** A handle usable inside a transaction (same query surface, one connection). */
export interface TxClient {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

/**
 * Data-access contract. Reads and writes are separate methods so Phase 0 (one
 * database) and Phase 2 (primary + read replicas) share the same call sites:
 * modules call queryRead for SELECTs and queryWrite for mutations, and the
 * implementation decides which physical connection to use (Requirement 14.3,
 * spec task 23.1). transaction always runs on the primary.
 */
export interface Db {
  queryWrite<T extends Row = Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  queryRead<T extends Row = Row>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
