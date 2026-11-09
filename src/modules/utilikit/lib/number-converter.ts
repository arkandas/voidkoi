export const BASE_FIELDS = ['dec', 'hex', 'oct', 'bin'] as const;
export const COMPLEMENT_FIELDS = ['ones', 'twos'] as const;
export const FLOAT_FIELDS = ['float32', 'float64'] as const;
export const FIELDS = [...BASE_FIELDS, ...COMPLEMENT_FIELDS, ...FLOAT_FIELDS] as const;
export const BIT_WIDTHS = [8, 16, 32] as const;

export type BaseField = (typeof BASE_FIELDS)[number];
export type ComplementField = (typeof COMPLEMENT_FIELDS)[number];
export type FloatField = (typeof FLOAT_FIELDS)[number];
export type Field = (typeof FIELDS)[number];
export type BitWidth = (typeof BIT_WIDTHS)[number];
export type Radix = 2 | 8 | 10 | 16;

export const RADIX: Record<BaseField, Radix> = { dec: 10, hex: 16, oct: 8, bin: 2 };
export const FLOAT_WIDTHS: Record<FloatField, 32 | 64> = { float32: 32, float64: 64 };
export const ASCII_MAX = BigInt(0x7f);

export const CONTROL_CHARS = [
  'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'TAB', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US',
  'DEL',
] as const;

export type ControlChar = (typeof CONTROL_CHARS)[number];

export interface NumberValue {
  integer: bigint | null;
  float: number;
}

export type InputError = 'invalidDecimal' | 'invalidHex' | 'invalidOctal' | 'invalidBinary';

export type ParseResult =
  | { ok: true; value: NumberValue }
  | { ok: false; error: InputError }
  | { ok: false; error: 'wrongLength'; length: number; expected: number };

export type FormatResult =
  | { ok: true; text: string }
  | { ok: false; issue: 'notInteger' }
  | { ok: false; issue: 'outOfRange'; min: bigint; max: bigint };

export type CharInfo =
  | { kind: 'printable'; char: string }
  | { kind: 'control'; name: ControlChar }
  | { kind: 'surrogate' };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const UNICODE_MAX = BigInt(0x10ffff);
const MAX_EXPONENT = 1000;
const BINARY = /^[01]+$/;
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const PREFIXES: Record<Radix, string> = { 2: '0b', 8: '0o', 10: '', 16: '0x' };
const DIGITS: Record<Radix, RegExp> = { 2: BINARY, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[\da-f]+$/i };
const INVALID = { hex: 'invalidHex', oct: 'invalidOctal', bin: 'invalidBinary' } as const;

export function parseInteger(text: string, radix: Radix): bigint | null {
  let digits = text.trim();
  const negative = digits.startsWith('-');
  if (negative || digits.startsWith('+')) digits = digits.slice(1);

  const prefix = PREFIXES[radix];
  if (prefix && digits.slice(0, 2).toLowerCase() === prefix) digits = digits.slice(2);
  if (!DIGITS[radix].test(digits)) return null;

  const magnitude = BigInt(prefix + digits);
  return negative ? -magnitude : magnitude;
}

export function formatInteger(value: bigint, radix: Radix): string {
  return value.toString(radix).toUpperCase();
}

function exactInteger(negative: boolean, digits: string, shift: number): bigint | null {
  const significant = digits.replace(/^0+/, '');
  if (!significant) return ZERO;

  const trailingZeros = significant.length - significant.replace(/0+$/, '').length;
  if (shift + trailingZeros < 0 || shift > MAX_EXPONENT) return null;

  const magnitude =
    shift < 0 ? BigInt(significant.slice(0, shift)) : BigInt(significant) * TEN ** BigInt(shift);
  return negative ? -magnitude : magnitude;
}

export function parseDecimal(text: string): NumberValue | null {
  const input = text.trim();
  const match = DECIMAL.exec(input);
  if (!match || !(match[2] || match[3])) return null;

  const [, sign, whole, fraction = '', exponent = '0'] = match;
  return {
    integer: exactInteger(sign === '-', whole + fraction, Number(exponent) - fraction.length),
    float: Number(input),
  };
}

export function complementRange(kind: ComplementField, bits: number): { min: bigint; max: bigint } {
  const max = (ONE << BigInt(bits - 1)) - ONE;
  return { min: kind === 'twos' ? -max - ONE : -max, max };
}

export function encodeComplement(kind: ComplementField, value: bigint, bits: number): string | null {
  const { min, max } = complementRange(kind, bits);
  if (value < min || value > max) return null;

  const pattern = kind === 'ones' && value < ZERO ? ~(-value) : value;
  return BigInt.asUintN(bits, pattern).toString(2).padStart(bits, '0');
}

function decodeComplement(kind: ComplementField, bits: string): bigint {
  const signed = BigInt.asIntN(bits.length, BigInt(`0b${bits}`));
  return kind === 'ones' && signed < ZERO ? signed + ONE : signed;
}

export function floatToBits(value: number, width: 32 | 64): string {
  const view = new DataView(new ArrayBuffer(8));
  if (width === 32) {
    view.setFloat32(0, value);
    return view.getUint32(0).toString(2).padStart(32, '0');
  }
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(2).padStart(64, '0');
}

function readFloat(bits: string): number {
  const view = new DataView(new ArrayBuffer(8));
  if (bits.length === 32) {
    view.setUint32(0, Number.parseInt(bits, 2));
    return view.getFloat32(0);
  }
  view.setBigUint64(0, BigInt(`0b${bits}`));
  return view.getFloat64(0);
}

export function splitFloatBits(bits: string): { sign: string; exponent: string; mantissa: string } | null {
  const exponentLength = bits.length === 32 ? 8 : bits.length === 64 ? 11 : 0;
  if (!exponentLength || !BINARY.test(bits)) return null;

  return {
    sign: bits.slice(0, 1),
    exponent: bits.slice(1, exponentLength + 1),
    mantissa: bits.slice(exponentLength + 1),
  };
}

export function describeCodePoint(code: bigint): CharInfo | null {
  if (code < ZERO || code > UNICODE_MAX) return null;

  const point = Number(code);
  if (point < 0x20) return { kind: 'control', name: CONTROL_CHARS[point] };
  if (point === 0x7f) return { kind: 'control', name: 'DEL' };
  if (point >= 0xd800 && point <= 0xdfff) return { kind: 'surrogate' };
  return { kind: 'printable', char: String.fromCodePoint(point) };
}

export function formatCodePoint(code: bigint): string {
  return `U+${formatInteger(code, 16).padStart(4, '0')}`;
}

function fromInteger(integer: bigint): NumberValue {
  return { integer, float: Number(integer) };
}

function fromFloat(float: number): NumberValue {
  return { integer: Number.isInteger(float) ? BigInt(float) : null, float };
}

export function parseField(field: Field, text: string, bitWidth: number): ParseResult {
  const input = text.trim();

  if (field === 'dec') {
    const value = parseDecimal(input);
    return value ? { ok: true, value } : { ok: false, error: 'invalidDecimal' };
  }

  if (field === 'hex' || field === 'oct' || field === 'bin') {
    const integer = parseInteger(input, RADIX[field]);
    return integer === null ? { ok: false, error: INVALID[field] } : { ok: true, value: fromInteger(integer) };
  }

  if (!BINARY.test(input)) return { ok: false, error: 'invalidBinary' };

  const expected = field === 'ones' || field === 'twos' ? bitWidth : FLOAT_WIDTHS[field];
  if (input.length !== expected) return { ok: false, error: 'wrongLength', length: input.length, expected };

  return {
    ok: true,
    value:
      field === 'ones' || field === 'twos' ? fromInteger(decodeComplement(field, input)) : fromFloat(readFloat(input)),
  };
}

function formatDecimal({ integer, float }: NumberValue): string {
  if (Object.is(float, -0)) return '-0';
  return integer === null ? String(float) : integer.toString();
}

export function formatField(field: Field, value: NumberValue, bitWidth: number): FormatResult {
  if (field === 'float32' || field === 'float64') {
    return { ok: true, text: floatToBits(value.float, FLOAT_WIDTHS[field]) };
  }
  if (field === 'dec') return { ok: true, text: formatDecimal(value) };
  if (value.integer === null) return { ok: false, issue: 'notInteger' };

  if (field === 'ones' || field === 'twos') {
    const text = encodeComplement(field, value.integer, bitWidth);
    return text === null ? { ok: false, issue: 'outOfRange', ...complementRange(field, bitWidth) } : { ok: true, text };
  }

  return { ok: true, text: formatInteger(value.integer, RADIX[field]) };
}
