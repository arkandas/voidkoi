'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { DNS_RESOLVERS, RECORD_TYPES, type DnsResolverId, type DnsResult } from '@/modules/utilikit/lib/dns-records';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { Alert, Button, Card, CardTitle, Input, Select, Spinner } from '@/components/ui';

const RESOLVER_LABELS: Record<DnsResolverId, string> = {
  cloudflare: 'Cloudflare (1.1.1.1)',
  google: 'Google (8.8.8.8)',
  quad9: 'Quad9 (9.9.9.9)',
};

function formatTtl(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

export default function DnsLookup() {
  const t = useTranslations('utilikit.dnsLookup');
  const locale = useLocale();
  const apiError = useErrorMessage();
  const [query, setQuery] = useState('');
  const [resolver, setResolver] = useState<DnsResolverId>('cloudflare');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/utilikit/dns-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, resolver }),
      });
      if (!response.ok) {
        setResult(null);
        setError(await readErrorCode(response));
        return;
      }
      setResult(await response.json());
    } catch (cause) {
      console.error('DNS lookup error:', cause);
      setError('lookupFailed');
    } finally {
      setLoading(false);
    }
  };

  const found = result?.answers.filter(answer => answer.records.length > 0) ?? [];
  const empty = result?.answers.filter(answer => answer.records.length === 0 && !answer.error) ?? [];
  const failed = result?.answers.filter(answer => answer.error) ?? [];
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <form onSubmit={lookup} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_16rem_auto] md:items-end">
            <Input
              label={t('query')}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="example.com"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            <Select
              label={t('resolver')}
              value={resolver}
              onChange={event => setResolver(event.target.value as DnsResolverId)}
              options={(Object.keys(DNS_RESOLVERS) as DnsResolverId[]).map(value => ({ value, label: RESOLVER_LABELS[value] }))}
            />
            <Button type="submit" disabled={loading || !query.trim()} className="h-11 sm:h-10">
              {loading ? <Spinner size={16} className="text-current" /> : <Search size={16} />}
              {t('lookUp')}
            </Button>
          </form>
          {error && <Alert className="mt-4">{apiError(error)}</Alert>}
        </Card>

        {result && (
          <Card>
            <CardTitle className="mb-4 break-all">{result.name}</CardTitle>

            {result.notFound ? (
              <Alert tone="warning">{t('notFound', { name: result.name })}</Alert>
            ) : found.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('noRecords')}</p>
            ) : (
              <div className="themed-scroll overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-xs text-ink-muted">
                    <tr>
                      <th className="w-16 px-2 py-2 font-semibold sm:w-20 sm:px-3">{t('columns.type')}</th>
                      <th className="px-2 py-2 font-semibold sm:px-3">{t('columns.value')}</th>
                      <th className="hidden w-20 px-3 py-2 text-right font-semibold sm:table-cell">{t('columns.ttl')}</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {found.flatMap(answer =>
                      answer.records.map((record, index) => (
                        <tr key={`${answer.type}-${index}`} className="align-top">
                          <td className="px-2 py-2 sm:px-3">
                            {index === 0 && (
                              <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                                {answer.type}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 font-mono break-all text-ink sm:px-3">
                            {record.priority !== undefined && <span className="mr-2 text-ink-muted">{record.priority}</span>}
                            {record.value}
                            {record.ttl !== undefined && (
                              <span className="mt-0.5 block font-sans text-xs text-ink-muted sm:hidden">
                                {t('columns.ttl')} {formatTtl(record.ttl)}
                              </span>
                            )}
                          </td>
                          <td className="hidden px-3 py-2 text-right tabular-nums text-ink-muted sm:table-cell">
                            {record.ttl !== undefined ? formatTtl(record.ttl) : ''}
                          </td>
                          <td className="px-2 py-1.5">
                            <CopyButton value={record.value} variant="ghost" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!result.notFound && empty.length > 0 && (
              <p className="mt-3 text-sm text-ink-muted">
                {t('emptyTypes', { types: list.format(empty.map(answer => answer.type)) })}
              </p>
            )}
            {failed.length > 0 && (
              <Alert tone="warning" className="mt-3">
                {t('failedTypes', { types: list.format(failed.map(answer => answer.type)) })}
              </Alert>
            )}
          </Card>
        )}

        <GuideCard>
          <CardTitle className="mb-3">{t('recordTypes')}</CardTitle>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {RECORD_TYPES.map(type => (
              <div key={type} className="flex gap-3">
                <dt className="w-14 shrink-0 font-mono font-semibold text-ink">{type}</dt>
                <dd className="text-ink-muted">{t(`types.${type}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-muted">{t('resolverNote')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
