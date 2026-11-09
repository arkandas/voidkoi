'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Clock, SlidersHorizontal, Type } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  buildCronExpression,
  CRON_FIELD_RANGES,
  CRON_FIELDS,
  CRON_PRESETS,
  CronField,
  describeCron,
  getNextRuns,
  normalizeCronExpression,
  parseCronExpression,
  validateCronExpression,
} from '@/modules/utilikit/lib/cron-utils';
import { Alert, Card, CardTitle, Input, Segmented } from '@/components/ui';

const NEXT_RUN_COUNT = 5;

const SYNTAX_EXAMPLES = [
  { token: '*', id: 'any' },
  { token: '*/5', id: 'step' },
  { token: '1,3,5', id: 'list' },
  { token: '1-5', id: 'range' },
] as const;

const NUMBERING_NOTES = [
  { field: 'dayOfWeek', id: 'weekdays' },
  { field: 'month', id: 'months' },
] as const;

const RUN_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};

type Mode = 'visual' | 'text';

function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 1000);
  return () => window.clearInterval(timer);
}

function getCurrentMinute(): number | null {
  return Math.floor(Date.now() / 60000) * 60000;
}

function getServerMinute(): number | null {
  return null;
}

export default function CronBuilder() {
  const t = useTranslations('utilikit.cronBuilder');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();
  const fieldId = useId();

  const [mode, setMode] = useState<Mode>('visual');
  const [expression, setExpression] = useState('* * * * *');
  const now = useSyncExternalStore(subscribeToClock, getCurrentMinute, getServerMinute);

  const parts = parseCronExpression(expression);
  const normalized = normalizeCronExpression(expression);
  const validation = validateCronExpression(expression);
  const description = describeCron(expression, locale);
  const nextRuns = now === null ? null : getNextRuns(expression, NEXT_RUN_COUNT, new Date(now));

  const error = validation.valid
    ? null
    : validation.error === 'invalidField'
      ? t('errors.invalidField', { field: t(`fields.${validation.field}`), range: CRON_FIELD_RANGES[validation.field] })
      : t(`errors.${validation.error}`);

  const updateField = (field: CronField, value: string) => {
    setExpression(buildCronExpression({ ...parts, [field]: value.replace(/\s+/g, '') }));
  };

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Segmented
          fullWidth
          value={mode}
          onChange={setMode}
          ariaLabel={t('mode')}
          options={[
            { value: 'visual', label: t('visualBuilder'), icon: SlidersHorizontal },
            { value: 'text', label: t('textInput'), icon: Type },
          ]}
        />

        <Card>
          <CardTitle className="mb-4">{tc('input')}</CardTitle>
          {mode === 'visual' ? (
            <>
              <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-5">
                {CRON_FIELDS.map(field => (
                  <div key={field} className="min-w-0">
                    <Label htmlFor={`${fieldId}-${field}`}>
                      {t(`fields.${field}`)}{' '}
                      <span className="font-mono text-xs text-ink-faint">{CRON_FIELD_RANGES[field]}</span>
                    </Label>
                    <Input
                      id={`${fieldId}-${field}`}
                      value={parts[field]}
                      onChange={e => updateField(field, e.target.value)}
                      placeholder="*"
                      className="font-mono"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>
              <Well className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{tc('examples')}</span>
                {SYNTAX_EXAMPLES.map(({ token, id }) => (
                  <span key={id}>
                    <code className="font-mono text-ink">{token}</code> {t(`syntax.${id}`)}
                  </span>
                ))}
              </Well>
            </>
          ) : (
            <Input
              value={expression}
              onChange={e => setExpression(e.target.value)}
              placeholder={t('enterCron')}
              aria-label={t('enterCron')}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
            />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>
              <Calendar size={18} />
              {t('expression')}
            </CardTitle>
            <CopyButton value={normalized} disabled={!normalized} />
          </div>
          <Well mono className="text-lg">
            {normalized || ' '}
          </Well>
        </Card>

        {error ? (
          <Alert>{error}</Alert>
        ) : (
          <>
            {description && (
              <Card>
                <CardTitle className="mb-3">{t('humanReadable')}</CardTitle>
                <p className="text-lg text-ink">{description}</p>
              </Card>
            )}

            <Card>
              <CardTitle className="mb-4">
                <Clock size={18} />
                {t('nextRuns')}
              </CardTitle>
              {nextRuns?.length === 0 && <p className="text-sm text-ink-muted">{t('noUpcomingRuns')}</p>}
              {nextRuns && nextRuns.length > 0 && (
                <ul className="space-y-2">
                  {nextRuns.map(date => {
                    const iso = date.toISOString();
                    return (
                      <li
                        key={iso}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{date.toLocaleString(locale, RUN_FORMAT)}</p>
                          <p className="break-all font-mono text-sm text-ink-muted">{iso}</p>
                        </div>
                        <CopyButton value={iso} variant="ghost" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}

        <Card>
          <CardTitle className="mb-4">{t('presets.title')}</CardTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CRON_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setExpression(preset.expression)}
                className="rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-accent"
              >
                <span className="mb-1 block font-medium text-ink">{t(`presets.${preset.id}.label`)}</span>
                <span className="mb-1 block font-mono text-xs text-ink-muted">{preset.expression}</span>
                <span className="block text-xs text-ink-muted">{t(`presets.${preset.id}.description`)}</span>
              </button>
            ))}
          </div>
        </Card>

        <GuideCard>
          <CardTitle className="mb-3">{t('syntax.title')}</CardTitle>
          <div className="space-y-3 text-sm text-ink-muted">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-ink">{tc('format')}</span>
              {CRON_FIELDS.map(field => (
                <span key={field} className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs text-ink">
                  {t(`fields.${field}`)}
                </span>
              ))}
            </div>
            <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {SYNTAX_EXAMPLES.map(({ token, id }) => (
                <div key={id} className="flex gap-2">
                  <dt className="shrink-0 font-mono font-semibold text-ink">{token}</dt>
                  <dd>{t(`syntax.${id}`)}</dd>
                </div>
              ))}
              {NUMBERING_NOTES.map(({ field, id }) => (
                <div key={id} className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-ink">{t(`fields.${field}`)}</dt>
                  <dd>{t(`syntax.${id}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
