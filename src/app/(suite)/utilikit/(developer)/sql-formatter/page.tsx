'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CodeView } from '@/modules/utilikit/components/code-view';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  formatSql,
  KEYWORD_CASES,
  SQL_DIALECTS,
  SQL_INDENTS,
  type KeywordCase,
  type SqlDialect,
  type SqlIndent,
} from '@/modules/utilikit/lib/sql-format';
import { Button, Card, CardTitle, Select } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const DIALECT_LABELS: Record<Exclude<SqlDialect, 'sql'>, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  tsql: 'SQL Server (T-SQL)',
  plsql: 'Oracle (PL/SQL)',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  redshift: 'Amazon Redshift',
  duckdb: 'DuckDB',
  clickhouse: 'ClickHouse',
  spark: 'Spark SQL',
  trino: 'Trino',
  db2: 'IBM Db2',
};

const SAMPLE = `select u.id, u.name, count(o.id) as orders, sum(o.total) as spent from users u left join orders o on o.user_id = u.id where u.created_at >= '2026-01-01' and u.active = true group by u.id, u.name having count(o.id) > 2 order by spent desc limit 10;`;

export default function SqlFormatter() {
  const t = useTranslations('utilikit.sqlFormatter');
  const tc = useTranslations('utilikit.common');
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('postgresql');
  const [keywordCase, setKeywordCase] = useState<KeywordCase>('upper');
  const [indent, setIndent] = useState<SqlIndent>('2');
  const deferred = useDeferredValue(input);

  const result = useMemo(
    () => (deferred.trim() ? formatSql(deferred, { dialect, keywordCase, indent }) : null),
    [deferred, dialect, keywordCase, indent]
  );
  const output = result?.ok ? result.text : '';

  const error =
    result && !result.ok
      ? result.line !== undefined && result.column !== undefined
        ? t('errorAt', { line: result.line, column: result.column })
        : t('error')
      : undefined;

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label={t('dialect')}
              value={dialect}
              onChange={event => setDialect(event.target.value as SqlDialect)}
              options={SQL_DIALECTS.map(value => ({ value, label: value === 'sql' ? t('standardSql') : DIALECT_LABELS[value] }))}
            />
            <Select
              label={t('keywords')}
              value={keywordCase}
              onChange={event => setKeywordCase(event.target.value as KeywordCase)}
              options={KEYWORD_CASES.map(value => ({ value, label: t(`keywordCases.${value}`) }))}
            />
            <Select
              label={t('indentation')}
              value={indent}
              onChange={event => setIndent(event.target.value as SqlIndent)}
              options={SQL_INDENTS.map(value => ({
                value,
                label: value === 'tab' ? t('tab') : t('spaces', { count: Number(value) }),
              }))}
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Card className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardTitle>{t('input')}</CardTitle>
              <div className="flex gap-1">
                <Button onClick={() => setInput(SAMPLE)} variant="ghost" size="sm">
                  {t('loadSample')}
                </Button>
                {input && (
                  <Button onClick={() => setInput('')} variant="ghost" size="sm">
                    {tc('clear')}
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('input')}
              spellCheck={false}
              className="h-96 font-mono sm:text-sm"
              error={error}
            />
            {result && !result.ok && <p className="mt-1 break-all font-mono text-xs text-ink-muted">{result.message}</p>}
          </Card>

          <Card className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <CardTitle>{tc('output')}</CardTitle>
              {output && <CopyButton value={output} label={tc('copy')} variant="ghost" />}
            </div>
            <Well className="h-96 overflow-hidden p-0 font-mono">
              {output ? (
                <CodeView language="sql">{output}</CodeView>
              ) : (
                <p className="px-3.5 py-3 text-ink-faint">{t('outputPlaceholder')}</p>
              )}
            </Well>
          </Card>
        </div>

        <GuideCard>
          <CardTitle className="mb-3">{t('about')}</CardTitle>
          <p className="text-sm text-ink-muted">{t('aboutText')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
