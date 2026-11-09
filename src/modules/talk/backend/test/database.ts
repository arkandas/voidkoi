/**
 * PostgreSQL for the tests, in process: PGlite, with the suite's schema made
 * by its migrations, as a real database gets it, check constraints included.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { Database, Queryable, QueryResult } from '../db';

const MIGRATIONS_DIR = resolve(process.cwd(), 'prisma/migrations');

/** Every migration's SQL, in order. */
function schemaSql(): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .map(name => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'))
    .join('\n');
}

type PgliteClient = Pick<PGlite | Transaction, 'query'>;

function wrap(client: PgliteClient): Queryable {
  return {
    async query<R>(text: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
      const result = await client.query<R>(text, [...params]);
      return { rows: result.rows, rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0) };
    },
  };
}

export interface TestDatabase extends Database {
  /** Empty every table, for the next test. */
  reset(): Promise<void>;
  /** Close it for real; `close` is left to the hub, which doesn't own it here. */
  destroy(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = await PGlite.create();
  await pglite.exec(schemaSql());
  const { rows } = await pglite.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  const tables = rows.map(row => `"${row.tablename}"`).join(', ');
  const base = wrap(pglite);
  return {
    query: base.query,
    transaction: work => pglite.transaction(tx => work(wrap(tx))),
    async close() {},
    async reset() {
      await pglite.exec(`truncate table ${tables} restart identity cascade`);
    },
    destroy: () => pglite.close(),
  };
}
