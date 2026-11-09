import type { RGB } from '@/modules/utilikit/lib/types';
import { parseHex } from '@/modules/utilikit/lib/color-utils';

export const WCAG_LEVELS = ['aa', 'aaa'] as const;
export type WcagLevel = (typeof WCAG_LEVELS)[number];

export const TEXT_SIZES = ['normal', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export type ContrastRating = 'aaa' | 'aa' | 'aaLarge' | 'fail';

export interface ContrastCheck {
  ratio: number;
  passes: Record<WcagLevel, Record<TextSize, boolean>>;
  rating: ContrastRating;
}

export const WCAG_THRESHOLDS: Record<WcagLevel, Record<TextSize, number>> = {
  aa: { normal: 4.5, large: 3 },
  aaa: { normal: 7, large: 4.5 },
};

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const LIGHT_SUGGESTIONS = ['#FFFFFF', '#F0F0F0', '#E0E0E0', '#D0D0D0'];
const DARK_SUGGESTIONS = ['#000000', '#1A1A1A', '#2A2A2A', '#3A3A3A'];

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(first: RGB, second: RGB): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function truncateRatio(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-9) / 100;
}

export function parseOpaqueHex(value: string): RGB | null {
  const parsed = parseHex(value);
  return parsed && (parsed.alpha ?? 1) === 1 ? parsed.rgb : null;
}

export function checkContrast(foreground: RGB, background: RGB): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  const passes = {
    aa: { normal: ratio >= WCAG_THRESHOLDS.aa.normal, large: ratio >= WCAG_THRESHOLDS.aa.large },
    aaa: { normal: ratio >= WCAG_THRESHOLDS.aaa.normal, large: ratio >= WCAG_THRESHOLDS.aaa.large },
  };

  let rating: ContrastRating = 'fail';
  if (passes.aaa.normal) rating = 'aaa';
  else if (passes.aa.normal) rating = 'aa';
  else if (passes.aa.large) rating = 'aaLarge';

  return { ratio, passes, rating };
}

export function suggestForegrounds(background: RGB): string[] {
  const candidates =
    contrastRatio(WHITE, background) > contrastRatio(BLACK, background) ? LIGHT_SUGGESTIONS : DARK_SUGGESTIONS;

  return candidates.filter(hex => {
    const rgb = parseOpaqueHex(hex);
    return rgb !== null && contrastRatio(rgb, background) >= WCAG_THRESHOLDS.aa.normal;
  });
}
