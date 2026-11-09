import { format, type SqlLanguage } from 'sql-formatter';

export const SQL_DIALECTS = [
  'sql',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'tsql',
  'plsql',
  'bigquery',
  'snowflake',
  'redshift',
  'duckdb',
  'clickhouse',
  'spark',
  'trino',
  'db2',
] as const satisfies readonly SqlLanguage[];
export type SqlDialect = (typeof SQL_DIALECTS)[number];

export const KEYWORD_CASES = ['preserve', 'upper', 'lower'] as const;
export type KeywordCase = (typeof KEYWORD_CASES)[number];

export const SQL_INDENTS = ['2', '4', 'tab'] as const;
export type SqlIndent = (typeof SQL_INDENTS)[number];

export interface SqlOptions {
  dialect: SqlDialect;
  keywordCase: KeywordCase;
  indent: SqlIndent;
}

export type SqlResult = { ok: true; text: string } | { ok: false; message: string; line?: number; column?: number };

export function formatSql(text: string, options: SqlOptions): SqlResult {
  try {
    return {
      ok: true,
      text: format(text, {
        language: options.dialect,
        keywordCase: options.keywordCase,
        useTabs: options.indent === 'tab',
        tabWidth: options.indent === '4' ? 4 : 2,
      }),
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).split('\n')[0];
    const position = /at line (\d+) column (\d+)/.exec(message);
    return position
      ? { ok: false, message, line: Number(position[1]), column: Number(position[2]) }
      : { ok: false, message };
  }
}
