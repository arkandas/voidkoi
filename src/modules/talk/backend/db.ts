/**
 * Talk's database seam. Its queries are plain SQL against the `talk_*` tables
 * and `users`, through `Queryable`, so the same queries run on PostgreSQL in
 * the server and on PGlite (PostgreSQL in WebAssembly) in the tests.
 */
import pg from 'pg';

export interface QueryResult<R> {
  rows: R[];
  /** Rows returned for a SELECT, rows affected for INSERT/UPDATE/DELETE. */
  rowCount: number;
}

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** A PostgreSQL error code acted on rather than only reported. */
export const PG_UNIQUE_VIOLATION = '23505';

export function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

const INT8 = 20;

/**
 * node-postgres hands back int8 as a string so nothing is lost. Talk's ids
 * are int4 and its only int8 is a file's size, so a number is safe, and it
 * matches what PGlite returns. Set on this pool only: Prisma shares `pg`.
 */
const TYPES = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === INT8 && format !== 'binary' ? (value: string) => Number.parseInt(value, 10) : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

type Client = Pick<pg.PoolClient, 'query'>;

function wrap(client: Client): Queryable {
  return {
    async query<R>(text: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
      const result = await client.query(text, [...params]);
      return { rows: result.rows as R[], rowCount: result.rowCount ?? result.rows.length };
    },
  };
}

/** The server's connection to PostgreSQL. */
export function createPostgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 5, types: TYPES });
  // An idle client's error with nobody listening would end the process.
  pool.on('error', error => console.error('Talk: idle database client failed:', error));
  const base = wrap(pool);
  return {
    query: base.query,
    async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await work(wrap(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
