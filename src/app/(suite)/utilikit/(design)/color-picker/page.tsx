'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HexColorPicker } from 'react-colorful';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Label } from '@/modules/utilikit/components/ui/label';
import {
  addRecentColor,
  COLOR_FORMATS,
  type Color,
  type ColorFormat,
  FORMAT_LABELS,
  formatColors,
  parseColorInput,
  parseHex,
  parseRecentColors,
} from '@/modules/utilikit/lib/color-utils';
import { Card, CardTitle, Input } from '@/components/ui';

const RECENT_COLORS_KEY = 'recentColors';
const DEFAULT_COLOR: Color = { rgb: { r: 59, g: 130, b: 246 }, alpha: 1 };

const PLACEHOLDERS: Record<ColorFormat, string> = {
  hex: '#RRGGBB',
  rgb: 'rgb(r, g, b)',
  rgba: 'rgba(r, g, b, a)',
  hsl: 'hsl(h, s%, l%)',
  hsla: 'hsla(h, s%, l%, a)',
  cmyk: 'cmyk(c%, m%, y%, k%)',
};

const EXAMPLES: Record<ColorFormat, string> = {
  hex: '#FF5733',
  rgb: 'rgb(255, 87, 51)',
  rgba: 'rgba(255, 87, 51, 0.8)',
  hsl: 'hsl(11, 100%, 60%)',
  hsla: 'hsla(11, 100%, 60%, 0.8)',
  cmyk: 'cmyk(0%, 66%, 80%, 0%)',
};

const GUIDE = [
  { topic: 'hex', label: 'HEX' },
  { topic: 'rgb', label: 'RGB / RGBA' },
  { topic: 'hsl', label: 'HSL / HSLA' },
  { topic: 'cmyk', label: 'CMYK' },
] as const;

const recentListeners = new Set<() => void>();

function subscribeToRecentColors(listener: () => void) {
  recentListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    recentListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readRecentColors(): string | null {
  try {
    return localStorage.getItem(RECENT_COLORS_KEY);
  } catch {
    return null;
  }
}

function rememberColor(hex: string) {
  try {
    const colors = addRecentColor(parseRecentColors(readRecentColors()), hex);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors));
  } catch {
    return;
  }
  recentListeners.forEach(listener => listener());
}

export default function ColorPicker() {
  const t = useTranslations('utilikit.colorPicker');
  const locale = useLocale();
  const id = useId();

  const [color, setColor] = useState<Color>(DEFAULT_COLOR);
  const [draft, setDraft] = useState<{ format: ColorFormat; value: string } | null>(null);
  const pickedHex = useRef<string | null>(null);

  const storedRecentColors = useSyncExternalStore(subscribeToRecentColors, readRecentColors, () => null);
  const recentColors = parseRecentColors(storedRecentColors);

  const formats = formatColors(color);
  const alphaLabel = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    color.alpha
  );

  const applyHex = (hex: string) => {
    const parsed = parseHex(hex);
    if (!parsed) return;
    setColor({ rgb: parsed.rgb, alpha: color.alpha });
    setDraft(null);
  };

  const handlePickerChange = (hex: string) => {
    pickedHex.current = hex;
    applyHex(hex);
  };

  const rememberPicked = () => {
    if (pickedHex.current) rememberColor(pickedHex.current);
    pickedHex.current = null;
  };

  const handleRecentClick = (hex: string) => {
    applyHex(hex);
    rememberColor(hex);
  };

  const handleAlphaChange = (alpha: number) => {
    setColor({ ...color, alpha });
    setDraft(null);
  };

  const handleFormatChange = (format: ColorFormat, value: string) => {
    setDraft({ format, value });
    const parsed = parseColorInput(format, value, color.alpha);
    if (parsed) setColor(parsed);
  };

  const handleFormatBlur = () => {
    if (draft && parseColorInput(draft.format, draft.value, color.alpha)) rememberColor(formats.hex);
    setDraft(null);
  };

  return (
    <ToolLayout>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">{t('selectColor')}</CardTitle>
          <div className="space-y-4">
            <div className="checkerboard h-48 overflow-hidden rounded-lg border border-line">
              <div className="h-full" style={{ backgroundColor: formats.rgba }} />
            </div>

            <div
              onPointerDown={() => window.addEventListener('pointerup', rememberPicked, { once: true })}
              onKeyUp={rememberPicked}
            >
              <HexColorPicker color={formats.hex} onChange={handlePickerChange} style={{ height: 320 }} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-alpha`} className="mb-0">
                  {t('opacity')}
                </Label>
                <span className="font-mono text-sm text-ink-muted">{alphaLabel}</span>
              </div>
              <div className="checkerboard rounded-md">
                <input
                  id={`${id}-alpha`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={color.alpha}
                  onChange={e => handleAlphaChange(Number(e.target.value))}
                  className="opacity-slider block w-full cursor-pointer"
                  style={{ background: `linear-gradient(to right, transparent, ${formats.rgb})` }}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-4">{t('colorFormats')}</CardTitle>
          <div className="space-y-4">
            {COLOR_FORMATS.map(format => (
              <div key={format}>
                <Label htmlFor={`${id}-${format}`}>{FORMAT_LABELS[format]}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${id}-${format}`}
                    value={draft?.format === format ? draft.value : formats[format]}
                    onChange={e => handleFormatChange(format, e.target.value)}
                    onBlur={handleFormatBlur}
                    placeholder={PLACEHOLDERS[format]}
                    aria-describedby={`${id}-${format}-example`}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono"
                  />
                  <CopyButton value={formats[format]} ariaLabel={t('copyFormat', { format: FORMAT_LABELS[format] })} />
                </div>
                <p id={`${id}-${format}-example`} className="mt-1.5 text-xs text-ink-muted">
                  {format === 'hex'
                    ? t('hexExample', { value: EXAMPLES.hex, short: '#F73' })
                    : t('example', { value: EXAMPLES[format] })}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {recentColors.length > 0 && (
        <Card className="mt-4 sm:mt-6">
          <CardTitle className="mb-4">{t('recentColors')}</CardTitle>
          <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
            {recentColors.map(hex => (
              <button
                key={hex}
                type="button"
                onClick={() => handleRecentClick(hex)}
                title={hex}
                aria-label={t('useColor', { color: hex })}
                className="h-12 w-full rounded-lg border-2 border-line transition-colors hover:border-accent focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </Card>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('colorFormatGuide')}</CardTitle>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          {GUIDE.map(({ topic, label }) => (
            <div key={topic}>
              <dt className="mb-1 font-medium text-ink">{label}</dt>
              <dd className="text-ink-muted">{t(`about.${topic}`)}</dd>
            </div>
          ))}
          <div className="md:col-span-2">
            <dt className="mb-1 font-medium text-ink">{t('usageTip')}</dt>
            <dd className="text-ink-muted">{t('usageTipDescription')}</dd>
          </div>
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
