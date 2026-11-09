import { describe, expect, it } from 'vitest';
import { formatSql, SQL_DIALECTS, type SqlOptions } from '@/modules/utilikit/lib/sql-format';

const defaults: SqlOptions = { dialect: 'sql', keywordCase: 'preserve', indent: '2' };

describe('formatSql', () => {
  it('puts clauses and columns on their own lines', () => {
    expect(formatSql('select a, b from t where x = 1', defaults)).toEqual({
      ok: true,
      text: 'select\n  a,\n  b\nfrom\n  t\nwhere\n  x = 1',
    });
  });

  it('changes the keyword case and the indentation', () => {
    expect(formatSql('select a from t', { ...defaults, keywordCase: 'upper', indent: '4' })).toEqual({
      ok: true,
      text: 'SELECT\n    a\nFROM\n    t',
    });
    expect(formatSql('SELECT a FROM t', { ...defaults, keywordCase: 'lower', indent: 'tab' })).toEqual({
      ok: true,
      text: 'select\n\ta\nfrom\n\tt',
    });
  });

  it('understands dialect-specific syntax', () => {
    expect(formatSql('select * from t where a = $1', { ...defaults, dialect: 'postgresql' }).ok).toBe(true);
    expect(formatSql('select top 5 * from t where a = @p', { ...defaults, dialect: 'tsql' }).ok).toBe(true);
  });

  it('reports where the query stopped making sense', () => {
    expect(formatSql('select * from t where a = $1', { ...defaults, dialect: 'sqlite' })).toMatchObject({
      ok: false,
      line: 1,
      column: 27,
    });
  });

  it('accepts every dialect it offers', () => {
    for (const dialect of SQL_DIALECTS) expect(formatSql('select 1', { ...defaults, dialect }).ok, dialect).toBe(true);
  });
});
