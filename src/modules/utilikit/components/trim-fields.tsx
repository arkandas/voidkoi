'use client';

import { Crosshair } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';

import { Button, Input } from '@/components/ui';
import { formatTimestamp, parseTimestamp, resolveTrim, type TrimResult } from '@/modules/utilikit/lib/time-range';

export interface TrimValues {
  start: string;
  end: string;
}

export const NO_TRIM: TrimValues = { start: '', end: '' };

export function evaluateTrim({ start, end }: TrimValues, duration: number | null): TrimResult {
  const from = start.trim() ? parseTimestamp(start) : null;
  const to = end.trim() ? parseTimestamp(end) : null;
  if ((start.trim() && from === null) || (end.trim() && to === null)) return { ok: false };
  return resolveTrim(from, to, duration ?? 0);
}

export function appendTrim(params: URLSearchParams, trim: TrimResult) {
  if (!trim.ok || !trim.trim) return;
  params.append('trimStart', String(trim.trim.start));
  params.append('trimEnd', String(trim.trim.start + trim.trim.duration));
}

interface TrimFieldsProps {
  value: TrimValues;
  onChange: (value: TrimValues) => void;
  duration: number | null;
  media?: RefObject<HTMLMediaElement | null>;
}

export function TrimFields({ value, onChange, duration, media }: TrimFieldsProps) {
  const t = useTranslations('utilikit.trim');
  const tc = useTranslations('utilikit.common');
  const result = evaluateTrim(value, duration);

  const field = (side: keyof TrimValues) => (
    <div className="flex items-end gap-2">
      <Input
        label={tc(side)}
        value={value[side]}
        onChange={event => onChange({ ...value, [side]: event.target.value })}
        placeholder={side === 'start' ? '0:00' : duration ? formatTimestamp(duration) : t('toTheEnd')}
        autoComplete="off"
        spellCheck={false}
        error={!result.ok && value[side].trim() && parseTimestamp(value[side]) === null ? t('badTime') : undefined}
      />
      {media ? (
        <Button
          variant="outline"
          className="mb-px h-11 shrink-0 px-3 sm:h-10"
          onClick={() => {
            const current = media.current?.currentTime;
            if (current !== undefined) onChange({ ...value, [side]: formatTimestamp(current) });
          }}
          aria-label={t('useCurrent')}
          title={t('useCurrent')}
        >
          <Crosshair size={16} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        {field('start')}
        {field('end')}
      </div>
      <p className={result.ok ? 'text-xs text-ink-muted' : 'text-xs font-medium text-danger'}>
        {!result.ok
          ? t('invalid')
          : result.trim
            ? t('clip', {
                length: formatTimestamp(result.trim.duration),
                start: formatTimestamp(result.trim.start),
                end: formatTimestamp(result.trim.start + result.trim.duration),
              })
            : t('whole')}
      </p>
    </div>
  );
}
