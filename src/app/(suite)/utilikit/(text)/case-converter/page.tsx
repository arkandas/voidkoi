'use client';

import { useDeferredValue, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Well } from '@/modules/utilikit/components/ui/well';
import { CASES, convertCase, textStats, type TextStats } from '@/modules/utilikit/lib/text-case';
import { Button, Card, CardTitle } from '@/components/ui';
import { Textarea } from '@/modules/utilikit/components/ui/fields';

const STATS = ['characters', 'charactersNoSpaces', 'words', 'sentences', 'lines', 'paragraphs'] as const;
const TIPS = ['programming', 'slug', 'reading'] as const;

export default function CaseConverter() {
  const t = useTranslations('utilikit.caseConverter');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const stats: TextStats = textStats(deferred, locale);
  const number = new Intl.NumberFormat(locale);
  const minutes = Math.round(stats.readingSeconds / 60);

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{t('input')}</CardTitle>
            {text && (
              <Button onClick={() => setText('')} variant="ghost" size="sm">
                {tc('clear')}
              </Button>
            )}
          </div>
          <Textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('input')}
            className="h-48"
          />
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 @lg:grid-cols-4 @4xl:grid-cols-7">
            {STATS.map(stat => (
              <Stat key={stat} label={t(`stats.${stat}`)} value={number.format(stats[stat])} />
            ))}
            <Stat
              label={t('stats.readingTime')}
              value={stats.words === 0 ? '0' : minutes < 1 ? t('underAMinute') : t('minutes', { count: minutes })}
            />
          </dl>
        </Card>

        <Card>
          <CardTitle className="mb-4">{t('conversions')}</CardTitle>
          {deferred ? (
            <div className="space-y-3">
              {CASES.map(to => {
                const value = convertCase(deferred, to);
                return (
                  <div key={to}>
                    <p className="mb-1 text-xs font-semibold text-ink-muted">{t(`cases.${to}`)}</p>
                    <div className="flex items-start gap-2">
                      <Well mono className="max-h-32 min-h-10 min-w-0 flex-1 overflow-auto whitespace-pre-wrap">
                        {value}
                      </Well>
                      <CopyButton value={value} disabled={!value} className="mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-canvas p-4 text-center text-sm text-ink-muted">{t('empty')}</p>
          )}
        </Card>

        <GuideCard>
          <CardTitle className="mb-3">{t('about')}</CardTitle>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            {TIPS.map(tip => (
              <div key={tip}>
                <dt className="font-medium text-ink">{t(`tips.${tip}.title`)}</dt>
                <dd className="text-ink-muted">{t(`tips.${tip}.text`)}</dd>
              </div>
            ))}
          </dl>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Well className="min-w-0 px-3 py-2.5 text-center">
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </Well>
  );
}
