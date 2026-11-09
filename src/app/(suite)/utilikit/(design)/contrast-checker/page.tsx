'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HexColorPicker } from 'react-colorful';
import { Check, Eye, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { Well } from '@/modules/utilikit/components/ui/well';
import { rgbToHex } from '@/modules/utilikit/lib/color-utils';
import {
  checkContrast,
  type ContrastRating,
  parseOpaqueHex,
  suggestForegrounds,
  TEXT_SIZES,
  truncateRatio,
  WCAG_LEVELS,
  WCAG_THRESHOLDS,
} from '@/modules/utilikit/lib/contrast-utils';
import { cn } from '@/lib/cn';
import { Card, CardTitle, Input } from '@/components/ui';

const FIELDS = ['foreground', 'background'] as const;
type Field = (typeof FIELDS)[number];

const DEFAULT_COLORS: Record<Field, string> = { foreground: '#000000', background: '#FFFFFF' };

const RATING_TONES: Record<ContrastRating, string> = {
  aaa: 'text-success',
  aa: 'text-success',
  aaLarge: 'text-warning',
  fail: 'text-danger',
};

export default function ContrastChecker() {
  const t = useTranslations('utilikit.contrastChecker');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const [colors, setColors] = useState<Record<Field, string>>(DEFAULT_COLORS);
  const [openPicker, setOpenPicker] = useState<Field | null>(null);

  const foreground = parseOpaqueHex(colors.foreground);
  const background = parseOpaqueHex(colors.background);
  const hexes: Record<Field, string | null> = {
    foreground: foreground && rgbToHex(foreground),
    background: background && rgbToHex(background),
  };
  const result = foreground && background ? checkContrast(foreground, background) : null;
  const suggestions = background
    ? suggestForegrounds(background).filter(suggestion => suggestion !== hexes.foreground)
    : [];

  const ratioFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const thresholdFormat = new Intl.NumberFormat(locale);

  const setColor = (field: Field, value: string) => setColors(current => ({ ...current, [field]: value }));

  return (
    <ToolLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {FIELDS.map(field => (
            <Card key={field}>
              <CardTitle className="mb-4">{t(`${field}.label`)}</CardTitle>
              <Input
                value={colors[field]}
                onChange={e => setColor(field, e.target.value)}
                placeholder={DEFAULT_COLORS[field]}
                aria-label={t(`${field}.label`)}
                error={hexes[field] ? undefined : t('invalidColor')}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
              />
              <div className="relative mt-4">
                <button
                  type="button"
                  onClick={() => setOpenPicker(openPicker === field ? null : field)}
                  aria-expanded={openPicker === field}
                  aria-label={t(`${field}.pick`)}
                  className="block h-24 w-full cursor-pointer rounded-lg border-2 border-line transition-colors hover:border-line-strong focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
                  style={{ backgroundColor: hexes[field] ?? undefined }}
                />
                {openPicker === field && (
                  <div className="absolute left-0 z-10 mt-2 w-full max-w-xs">
                    <div className="fixed inset-0" onClick={() => setOpenPicker(null)} />
                    <HexColorPicker
                      color={hexes[field] ?? DEFAULT_COLORS[field]}
                      onChange={value => setColor(field, value.toUpperCase())}
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {result && (
          <>
            <Card>
              <CardTitle className="mb-4">
                <Eye size={18} className="text-ink-muted" />
                {tc('preview')}
              </CardTitle>
              <div
                className="rounded-lg border-2 border-line p-4 sm:p-8"
                style={{ backgroundColor: hexes.background ?? undefined, color: hexes.foreground ?? undefined }}
              >
                <p className="mb-2 text-base">{t('normalSample')}</p>
                <p className="text-2xl font-bold">{t('largeSample')}</p>
              </div>
            </Card>

            <Card>
              <CardTitle className="mb-4">{t('contrastRatio')}</CardTitle>
              <div className="text-center">
                <p className="text-5xl font-bold text-ink">{`${ratioFormat.format(truncateRatio(result.ratio))}:1`}</p>
                <p className={cn('mt-2 text-lg font-medium', RATING_TONES[result.rating])}>
                  {t(`rating.${result.rating}`)}
                </p>
              </div>
            </Card>

            <Card>
              <CardTitle className="mb-4">{t('wcagResults')}</CardTitle>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {WCAG_LEVELS.map(level => (
                  <Well key={level} className="p-4">
                    <p className="mb-3 font-semibold">{t('level', { level: level.toUpperCase() })}</p>
                    <ul className="space-y-2">
                      {TEXT_SIZES.map(size => (
                        <li key={size} className="flex items-center justify-between gap-3">
                          <span>{t(`textSize.${size}`)}</span>
                          <StatusBadge passed={result.passes[level][size]} />
                        </li>
                      ))}
                    </ul>
                  </Well>
                ))}
              </div>
            </Card>

            {result.rating !== 'aaa' && suggestions.length > 0 && (
              <Card>
                <CardTitle className="mb-4">{t('suggestions')}</CardTitle>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setColor('foreground', suggestion)}
                      className="rounded-lg border-2 border-line p-4 transition-colors hover:border-accent focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
                      style={{ backgroundColor: hexes.background ?? undefined, color: suggestion }}
                    >
                      <span className="mb-2 block font-mono text-sm">{suggestion}</span>
                      <span className="block text-xs">{t('sampleText')}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        <GuideCard>
          <CardTitle className="mb-3">{t('requirements')}</CardTitle>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            {WCAG_LEVELS.map(level => (
              <div key={level}>
                <p className="font-medium text-ink">{t('level', { level: level.toUpperCase() })}</p>
                <p className="mb-2 text-ink-muted">{t(`levelDescription.${level}`)}</p>
                <dl className="space-y-1">
                  {TEXT_SIZES.map(size => (
                    <div key={size} className="flex justify-between gap-3">
                      <dt className="text-ink-muted">{t(`textSize.${size}`)}</dt>
                      <dd className="font-mono text-ink">{`${thresholdFormat.format(WCAG_THRESHOLDS[level][size])}:1`}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{t('largeTextDefinition')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

function StatusBadge({ passed }: { passed: boolean }) {
  const t = useTranslations('utilikit.contrastChecker');
  const Icon = passed ? Check : X;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        passed ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
      )}
    >
      <Icon size={14} />
      {t(passed ? 'pass' : 'fail')}
    </span>
  );
}
