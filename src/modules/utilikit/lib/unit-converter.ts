export const UNIT_CATEGORIES = ['temperature', 'length', 'weight', 'volume'] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];

export const UNITS = {
  temperature: ['c', 'f', 'k'],
  length: ['cm', 'm', 'km', 'ft', 'in', 'mi'],
  weight: ['g', 'kg', 'lb', 'oz'],
  volume: ['l', 'ml', 'gal', 'cup'],
} as const;

export type UnitId = (typeof UNITS)[UnitCategory][number];

export const UNIT_SYMBOLS: Record<Exclude<UnitId, 'cup'>, string> = {
  c: '°C',
  f: '°F',
  k: 'K',
  cm: 'cm',
  m: 'm',
  km: 'km',
  ft: 'ft',
  in: 'in',
  mi: 'mi',
  g: 'g',
  kg: 'kg',
  lb: 'lb',
  oz: 'oz',
  l: 'L',
  ml: 'ml',
  gal: 'gal',
};

const TO_BASE: Partial<Record<UnitId, number>> = {
  cm: 0.01,
  m: 1,
  km: 1000,
  ft: 0.3048,
  in: 0.0254,
  mi: 1609.344,
  g: 1,
  kg: 1000,
  lb: 453.59237,
  oz: 28.349523125,
  l: 1,
  ml: 0.001,
  gal: 3.785411784,
  cup: 0.2365882365,
};

function toCelsius(value: number, unit: UnitId): number {
  if (unit === 'f') return ((value - 32) * 5) / 9;
  if (unit === 'k') return value - 273.15;
  return value;
}

function fromCelsius(celsius: number, unit: UnitId): number {
  if (unit === 'f') return (celsius * 9) / 5 + 32;
  if (unit === 'k') return celsius + 273.15;
  return celsius;
}

export function getUnits(category: UnitCategory): readonly UnitId[] {
  return UNITS[category];
}

function isUnitOf(category: UnitCategory, id: string): id is UnitId {
  const ids: readonly string[] = UNITS[category];
  return ids.includes(id);
}

export function convert(value: number, category: UnitCategory, from: string, to: string): number {
  if (!isUnitOf(category, from) || !isUnitOf(category, to)) return NaN;
  if (from === to) return value;
  if (category === 'temperature') return fromCelsius(toCelsius(value, from), to);

  const fromFactor = TO_BASE[from];
  const toFactor = TO_BASE[to];
  return fromFactor === undefined || toFactor === undefined ? NaN : (value * fromFactor) / toFactor;
}

export function convertToAll(value: number, category: UnitCategory, from: string): Partial<Record<UnitId, number>> {
  if (!Number.isFinite(value) || !isUnitOf(category, from)) return {};

  return Object.fromEntries(
    getUnits(category)
      .filter(unit => unit !== from)
      .map(unit => [unit, convert(value, category, from, unit)])
  );
}

export function parseDecimal(text: string, locale: string): number {
  const separator =
    new Intl.NumberFormat(locale).formatToParts(0.5).find(part => part.type === 'decimal')?.value ?? '.';
  const normalized = text.trim().replace('−', '-').replace(separator, '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(normalized)) return NaN;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    signDisplay: 'negative',
    notation: Math.abs(value) >= 1e21 ? 'scientific' : 'standard',
  }).format(value);
}
