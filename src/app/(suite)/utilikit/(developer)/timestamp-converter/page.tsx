'use client';

import { useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import { formatDateTime, getTimestampFormats, parseDateString, parseUnixTimestamp } from '@/modules/utilikit/lib/timestamp-utils';
import { Button, Card, CardTitle, Input } from '@/components/ui';

const TIMESTAMP_FIELDS = ['seconds', 'milliseconds', 'iso', 'utc', 'local'] as const;

type TimestampField = (typeof TIMESTAMP_FIELDS)[number];

const ABOUT_ITEMS = [
  { id: 'unix', label: 'unixTimestamp' },
  { id: 'iso', label: 'fields.iso' },
  { id: 'utc', label: 'fields.utc' },
] as const;

function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 1000);
  return () => window.clearInterval(timer);
}

function getCurrentSecond(): number | null {
  return Math.floor(Date.now() / 1000) * 1000;
}

function getServerSecond(): number | null {
  return null;
}

function formatTimestamp(ms: number, locale: string): Record<TimestampField, string> {
  const { seconds, milliseconds, iso } = getTimestampFormats(ms);
  return {
    seconds: String(seconds),
    milliseconds: String(milliseconds),
    iso,
    utc: formatDateTime(ms, locale, 'UTC'),
    local: formatDateTime(ms, locale),
  };
}

export default function TimestampConverter() {
  const t = useTranslations('utilikit.timestampConverter');
  const tc = useTranslations('utilikit.common');

  const now = useSyncExternalStore(subscribeToClock, getCurrentSecond, getServerSecond);
  const [unixInput, setUnixInput] = useState('');
  const [dateInput, setDateInput] = useState('');

  const unix = parseUnixTimestamp(unixInput);
  const dateMs = parseDateString(dateInput);
  const converted = unix?.ms ?? dateMs;

  const applyCurrentTime = () => {
    if (now === null) return;
    setUnixInput(String(now / 1000));
    setDateInput('');
  };

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <Clock size={18} />
              {t('currentTime')}
            </CardTitle>
            <Button onClick={applyCurrentTime} size="sm" variant="ghost" disabled={now === null}>
              {t('useThis')}
            </Button>
          </div>
          <TimestampDetails ms={now} />
        </Card>

        <Card>
          <CardTitle className="mb-4">{tc('convert')}</CardTitle>
          <div className="space-y-4">
            <div>
              <Input
                type="number"
                label={t('unixTimestamp')}
                value={unixInput}
                onChange={e => {
                  setUnixInput(e.target.value);
                  setDateInput('');
                }}
                placeholder={t('timestampPlaceholder')}
                error={unixInput.trim() && !unix ? t('errors.invalidTimestamp') : undefined}
              />
              {unix && <p className="mt-1.5 text-xs text-ink-muted">{t('detectedUnit', { unit: unix.unit })}</p>}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-ink-muted">{t('or')}</span>
              </div>
            </div>
            <Input
              label={t('dateString')}
              value={dateInput}
              onChange={e => {
                setDateInput(e.target.value);
                setUnixInput('');
              }}
              placeholder={t('dateStringPlaceholder')}
              spellCheck={false}
              error={dateInput.trim() && dateMs === null ? t('errors.invalidDate') : undefined}
            />
          </div>
        </Card>
      </div>

      {converted !== null && (
        <Card className="mt-4 sm:mt-6">
          <CardTitle className="mb-4">{t('convertedTime')}</CardTitle>
          <TimestampDetails ms={converted} />
        </Card>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('aboutTimestamps')}</CardTitle>
        <dl className="space-y-2 text-sm">
          {ABOUT_ITEMS.map(item => (
            <div key={item.id}>
              <dt className="font-medium text-ink">{t(item.label)}</dt>
              <dd className="text-ink-muted">{t(`about.${item.id}`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}

function TimestampDetails({ ms }: { ms: number | null }) {
  const t = useTranslations('utilikit.timestampConverter');
  const locale = useLocale();
  const values = ms === null ? null : formatTimestamp(ms, locale);

  return (
    <div className="space-y-3">
      {TIMESTAMP_FIELDS.map(field => {
        const value = values?.[field] ?? '';
        return (
          <div key={field}>
            <p className="mb-1.5 text-sm font-medium text-ink-muted">{t(`fields.${field}`)}</p>
            <div className="flex items-start gap-2">
              <Well mono className="min-w-0 flex-1">
                {value || ' '}
              </Well>
              <CopyButton value={value} disabled={!value} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
