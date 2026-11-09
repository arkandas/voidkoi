import { describe, expect, it } from 'vitest';
import {
  BIT_WIDTHS,
  complementRange,
  describeCodePoint,
  encodeComplement,
  Field,
  FIELDS,
  floatToBits,
  formatCodePoint,
  formatField,
  formatInteger,
  NumberValue,
  parseDecimal,
  parseField,
  parseInteger,
  Radix,
  splitFloatBits,
} from '@/modules/utilikit/lib/number-converter';

const big = BigInt;
const TWO = big(2);
const RADIXES: Radix[] = [2, 8, 10, 16];
const BEYOND_SAFE = TWO ** big(53) + big(1);

const hexToBits = (hex: string, width: number) => big(`0x${hex}`).toString(2).padStart(width, '0');

const typedArrayBits = (value: number, width: 32 | 64) =>
  width === 32
    ? new Uint32Array(new Float32Array([value]).buffer)[0].toString(2).padStart(32, '0')
    : new BigUint64Array(new Float64Array([value]).buffer)[0].toString(2).padStart(64, '0');

const int32Bits = (pattern: number, width: number) =>
  ((pattern & (width === 32 ? 0xffffffff : (1 << width) - 1)) >>> 0).toString(2).padStart(width, '0');

const samples = (min: number, max: number) => [min, min + 1, -100, -5, -1, 0, 1, 5, 100, max - 1, max];

const valueOf = (field: Field, text: string, bitWidth = 8): NumberValue => {
  const result = parseField(field, text, bitWidth);
  if (!result.ok) throw new Error(`${field} rejected "${text}"`);
  return result.value;
};

const textOf = (field: Field, value: NumberValue, bitWidth = 8): string => {
  const result = formatField(field, value, bitWidth);
  if (!result.ok) throw new Error(`${field} could not show the value`);
  return result.text;
};

describe('parseInteger', () => {
  it('agrees with parseInt in every base', () => {
    for (const radix of RADIXES) {
      for (const n of [0, 1, 7, 8, 10, 15, 16, 255, 256, 4095, 65535, 2 ** 31 - 1, 2 ** 32 + 5]) {
        const text = n.toString(radix);
        expect(parseInteger(text, radix)).toBe(big(Number.parseInt(text, radix)));
        expect(parseInteger(`-${text}`, radix)).toBe(-big(n));
      }
    }
  });

  it('keeps full precision past Number.MAX_SAFE_INTEGER', () => {
    expect(parseInteger('9007199254740993', 10)).toBe(BEYOND_SAFE);
    expect(parseInteger(`2${'0'.repeat(12)}1`, 16)).toBe(BEYOND_SAFE);
    expect(parseInteger(`4${'0'.repeat(16)}1`, 8)).toBe(BEYOND_SAFE);
    expect(parseInteger(`1${'0'.repeat(52)}1`, 2)).toBe(BEYOND_SAFE);
    expect(parseInteger('FFFFFFFFFFFFFFFF', 16)).toBe(big('18446744073709551615'));
    expect(parseInteger(`1${'0'.repeat(100)}`, 10)).toBe(big(10) ** big(100));
  });

  it('accepts a sign and a base prefix in either case', () => {
    const cases: [string, Radix, number][] = [
      ['0xff', 16, 255],
      ['0XFF', 16, 255],
      ['-0x1a', 16, -26],
      ['+0x1A', 16, 26],
      ['0b1010', 2, 10],
      ['0B11', 2, 3],
      ['-0b1', 2, -1],
      ['0o17', 8, 15],
      ['0O777', 8, 511],
      ['-0o10', 8, -8],
      ['+42', 10, 42],
    ];
    for (const [text, radix, expected] of cases) {
      expect(parseInteger(text, radix)).toBe(big(expected));
    }
  });

  it('ignores leading zeros and surrounding whitespace', () => {
    const cases: [string, Radix, number][] = [
      ['000123', 10, 123],
      ['0007', 8, 7],
      ['00000001', 2, 1],
      ['0x00ff', 16, 255],
      ['  ff  ', 16, 255],
      ['\t-12\n', 10, -12],
      ['-000', 10, 0],
    ];
    for (const [text, radix, expected] of cases) {
      expect(parseInteger(text, radix)).toBe(big(expected));
    }
  });

  it('rejects empty input, lone signs or prefixes and digits outside the base', () => {
    for (const radix of RADIXES) {
      for (const text of ['', '   ', '-', '+', '--1', '1-', '1 0', '1_000', '١٢', '１２']) {
        expect(parseInteger(text, radix)).toBeNull();
      }
    }

    const cases: [string, Radix][] = [
      ['0x', 16],
      ['-0x', 16],
      ['0b', 2],
      ['0o', 8],
      ['2', 2],
      ['0b12', 2],
      ['8', 8],
      ['19', 8],
      ['0x1F', 8],
      ['G', 16],
      ['0o17', 16],
      ['1A', 10],
      ['1.5', 10],
      ['1e3', 10],
      ['0x10', 10],
    ];
    for (const [text, radix] of cases) {
      expect(parseInteger(text, radix)).toBeNull();
    }
  });

  it('reads 0b as hex digits, not as a prefix, in base 16', () => {
    expect(parseInteger('0b10', 16)).toBe(big(0xb10));
  });
});

describe('formatInteger', () => {
  it('matches Number.prototype.toString for safe integers, in upper case', () => {
    const values = [0, 1, -1, 42, -42, 255, -256, 4096, 123456789, -987654321];
    for (const n of [...values, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      for (const radix of RADIXES) {
        expect(formatInteger(big(n), radix)).toBe(n.toString(radix).toUpperCase());
      }
    }
  });

  it('formats values past 2^53 exactly', () => {
    const max64 = TWO ** big(64) - big(1);
    expect(formatInteger(BEYOND_SAFE, 10)).toBe('9007199254740993');
    expect(formatInteger(max64, 16)).toBe('F'.repeat(16));
    expect(formatInteger(max64, 8)).toBe(`1${'7'.repeat(21)}`);
    expect(formatInteger(max64, 2)).toBe('1'.repeat(64));
    expect(formatInteger(-(TWO ** big(70)), 16)).toBe(`-4${'0'.repeat(17)}`);
  });

  it('round-trips through parseInteger in every base', () => {
    const values = [
      ...[0, 1, -1, 127, -128, 255, 65535, -2147483648, 4294967295].map(n => big(n)),
      TWO ** big(53) - big(1),
      TWO ** big(53),
      BEYOND_SAFE,
      -(TWO ** big(63)),
      TWO ** big(64) - big(1),
      big(10) ** big(40) + big(7),
      -(big(3) ** big(100)),
    ];
    for (const value of values) {
      for (const radix of RADIXES) {
        expect(parseInteger(formatInteger(value, radix), radix)).toBe(value);
      }
    }
  });
});

describe('parseDecimal', () => {
  it('parses integers exactly, even past the safe range', () => {
    expect(parseDecimal('9007199254740993')).toEqual({ integer: BEYOND_SAFE, float: 9007199254740992 });
    expect(parseDecimal('-42')).toEqual({ integer: big(-42), float: -42 });
    expect(parseDecimal(' +007 ')).toEqual({ integer: big(7), float: 7 });
    expect(parseDecimal(`1${'0'.repeat(400)}`)).toEqual({ integer: big(10) ** big(400), float: Infinity });
  });

  it('keeps an exact integer when a fraction or exponent is whole', () => {
    const cases: [string, number][] = [
      ['1.0', 1],
      ['5.', 5],
      ['1.50e1', 15],
      ['1e3', 1000],
      ['120e-1', 12],
      ['100e-2', 1],
      ['0012.00', 12],
      ['-2.5E2', -250],
      ['0.000', 0],
    ];
    for (const [text, expected] of cases) {
      expect(parseDecimal(text)).toEqual({ integer: big(expected), float: Number(text) });
    }
  });

  it('does not round exponents through a double', () => {
    expect(parseDecimal('1e30')?.integer).toBe(big(10) ** big(30));
    expect(parseDecimal('1e30')?.integer).not.toBe(big(1e30));
    expect(parseDecimal('1e400')).toEqual({ integer: big(10) ** big(400), float: Infinity });
  });

  it('has no integer part for real fractions, however close to a whole number', () => {
    for (const text of ['0.1', '1.5', '-0.25', '.5', '1e-3', '12e-1', '100e-3', '1.0000000000000000001']) {
      expect(parseDecimal(text)).toEqual({ integer: null, float: Number(text) });
    }
  });

  it('keeps the sign of negative zero', () => {
    const zero = parseDecimal('-0');
    expect(zero?.integer).toBe(big(0));
    expect(Object.is(zero?.float, -0)).toBe(true);
  });

  it('does not expand huge exponents', () => {
    expect(parseDecimal('1e999999999')).toEqual({ integer: null, float: Infinity });
    expect(parseDecimal('1e-999999999')).toEqual({ integer: null, float: 0 });
    expect(parseDecimal('0e999999999')).toEqual({ integer: big(0), float: 0 });
  });

  it('rejects malformed numbers', () => {
    const malformed = ['', '  ', '-', '+', '.', 'e5', '.e5', '1e', '1e+', '1.2.3', '1,5', '0x10', '0b1', 'abc'];
    for (const text of [...malformed, '1 2', 'Infinity', 'NaN', '--1', '١']) {
      expect(parseDecimal(text)).toBeNull();
    }
  });
});

describe("two's complement", () => {
  it('matches 32-bit integer arithmetic at every bit width', () => {
    for (const bits of BIT_WIDTHS) {
      const { min, max } = complementRange('twos', bits);
      for (const n of samples(Number(min), Number(max))) {
        const expected = int32Bits(n, bits);
        expect(encodeComplement('twos', big(n), bits)).toBe(expected);
        expect(valueOf('twos', expected, bits).integer).toBe(big(n));
      }
    }
  });

  it('covers the textbook values', () => {
    expect(encodeComplement('twos', big(5), 8)).toBe('00000101');
    expect(encodeComplement('twos', big(-5), 8)).toBe('11111011');
    expect(encodeComplement('twos', big(-128), 8)).toBe('10000000');
    expect(encodeComplement('twos', big(-1), 16)).toBe('1'.repeat(16));
    expect(encodeComplement('twos', big(-2147483648), 32)).toBe(`1${'0'.repeat(31)}`);
  });

  it('uses the asymmetric range', () => {
    expect(complementRange('twos', 8)).toEqual({ min: big(-128), max: big(127) });
    expect(complementRange('twos', 16)).toEqual({ min: big(-32768), max: big(32767) });
    expect(complementRange('twos', 32)).toEqual({ min: big(-2147483648), max: big(2147483647) });
    expect(encodeComplement('twos', big(128), 8)).toBeNull();
    expect(encodeComplement('twos', big(-129), 8)).toBeNull();
    expect(encodeComplement('twos', TWO ** big(31), 32)).toBeNull();
  });
});

describe("one's complement", () => {
  it('flips every bit of the magnitude for negative numbers', () => {
    for (const bits of BIT_WIDTHS) {
      const { min, max } = complementRange('ones', bits);
      for (const n of samples(Number(min), Number(max))) {
        const expected = n < 0 ? int32Bits(~-n, bits) : int32Bits(n, bits);
        expect(encodeComplement('ones', big(n), bits)).toBe(expected);
        expect(valueOf('ones', expected, bits).integer).toBe(big(n));
      }
    }
    expect(encodeComplement('ones', big(-5), 8)).toBe('11111010');
  });

  it('has two representations of zero', () => {
    expect(encodeComplement('ones', big(0), 8)).toBe('00000000');
    expect(valueOf('ones', '00000000').integer).toBe(big(0));
    expect(valueOf('ones', '11111111').integer).toBe(big(0));
  });

  it('uses the symmetric range', () => {
    expect(complementRange('ones', 8)).toEqual({ min: big(-127), max: big(127) });
    expect(complementRange('ones', 32)).toEqual({ min: big(-2147483647), max: big(2147483647) });
    expect(encodeComplement('ones', big(-127), 8)).toBe('10000000');
    expect(valueOf('ones', '10000000').integer).toBe(big(-127));
    expect(encodeComplement('ones', big(-128), 8)).toBeNull();
  });
});

describe('floatToBits', () => {
  it('matches published single-precision encodings', () => {
    const cases: [number, string][] = [
      [1, '3F800000'],
      [-2, 'C0000000'],
      [0.15625, '3E200000'],
      [0.1, '3DCCCCCD'],
      [100, '42C80000'],
      [16777217, '4B800000'],
      [(2 - 2 ** -23) * 2 ** 127, '7F7FFFFF'],
      [2 ** -149, '00000001'],
      [Infinity, '7F800000'],
      [-Infinity, 'FF800000'],
      [-0, '80000000'],
    ];
    for (const [value, hex] of cases) {
      expect(floatToBits(value, 32)).toBe(hexToBits(hex, 32));
    }
  });

  it('matches published double-precision encodings', () => {
    const cases: [number, string][] = [
      [1, '3FF0000000000000'],
      [-2, 'C000000000000000'],
      [0.1, '3FB999999999999A'],
      [100, '4059000000000000'],
      [2 ** 53 + 1, '4340000000000000'],
      [Number.MAX_VALUE, '7FEFFFFFFFFFFFFF'],
      [Number.MIN_VALUE, '0000000000000001'],
      [Infinity, '7FF0000000000000'],
      [-0, '8000000000000000'],
    ];
    for (const [value, hex] of cases) {
      expect(floatToBits(value, 64)).toBe(hexToBits(hex, 64));
    }
  });

  it('agrees with typed-array reinterpretation', () => {
    const values = [0, 1, -1, 0.5, 0.1, -123.456, Math.PI, Math.E, 1e-40, 1e-310, 3e38, 4e38, 1e300, 65504, -(2 ** 60)];
    for (const value of values) {
      expect(floatToBits(value, 32)).toBe(typedArrayBits(value, 32));
      expect(floatToBits(value, 64)).toBe(typedArrayBits(value, 64));
    }
  });

  it('encodes NaN with an all-ones exponent and a non-zero mantissa', () => {
    for (const width of [32, 64] as const) {
      const parts = splitFloatBits(floatToBits(NaN, width));
      expect(parts?.exponent).toMatch(/^1+$/);
      expect(parts?.mantissa).toMatch(/1/);
    }
  });
});

describe('splitFloatBits', () => {
  it('splits single precision into 1 + 8 + 23 bits', () => {
    expect(splitFloatBits(hexToBits('3E200000', 32))).toEqual({
      sign: '0',
      exponent: '01111100',
      mantissa: `01${'0'.repeat(21)}`,
    });
  });

  it('splits double precision into 1 + 11 + 52 bits', () => {
    expect(splitFloatBits(hexToBits('C000000000000000', 64))).toEqual({
      sign: '1',
      exponent: '10000000000',
      mantissa: '0'.repeat(52),
    });
  });

  it('rejects other lengths and non-binary digits', () => {
    for (const bits of ['', '1'.repeat(31), '1'.repeat(33), '1'.repeat(48), '2'.repeat(32), `${'0'.repeat(63)}x`]) {
      expect(splitFloatBits(bits)).toBeNull();
    }
  });
});

describe('describeCodePoint', () => {
  it('names the ASCII control characters', () => {
    const cases: [number, string][] = [
      [0, 'NUL'],
      [7, 'BEL'],
      [9, 'TAB'],
      [10, 'LF'],
      [13, 'CR'],
      [27, 'ESC'],
      [31, 'US'],
      [127, 'DEL'],
    ];
    for (const [code, name] of cases) {
      expect(describeCodePoint(big(code))).toEqual({ kind: 'control', name });
    }

    const controls = Array.from({ length: 128 }, (_, code) => describeCodePoint(big(code))).filter(
      info => info?.kind === 'control'
    );
    expect(controls).toHaveLength(33);
  });

  it('returns every printable ASCII character', () => {
    for (let code = 0x20; code < 0x7f; code++) {
      expect(describeCodePoint(big(code))).toEqual({ kind: 'printable', char: String.fromCharCode(code) });
    }
  });

  it('returns characters that match codePointAt and encode as well-formed UTF-8', () => {
    for (const char of ['ñ', '€', '日', '😀', '\u{10FFFF}']) {
      expect(describeCodePoint(big(char.codePointAt(0) ?? -1))).toEqual({ kind: 'printable', char });
    }

    for (let code = 0x80; code <= 0x10ffff; code += 0x1fff) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const info = describeCodePoint(big(code));
      if (info?.kind !== 'printable') throw new Error(`U+${code.toString(16)} is not printable`);
      expect(info.char.codePointAt(0)).toBe(code);
      expect([...info.char]).toHaveLength(1);
      expect(new TextEncoder().encode(info.char)).toHaveLength(code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
    }
  });

  it('flags UTF-16 surrogates instead of producing broken strings', () => {
    for (const code of [0xd800, 0xdbff, 0xdc00, 0xdfff]) {
      expect(describeCodePoint(big(code))).toEqual({ kind: 'surrogate' });
    }
    expect(describeCodePoint(big(0xd7ff))?.kind).toBe('printable');
    expect(describeCodePoint(big(0xe000))?.kind).toBe('printable');
  });

  it('returns null outside U+0000 to U+10FFFF', () => {
    expect(describeCodePoint(big(-1))).toBeNull();
    expect(describeCodePoint(big(0x110000))).toBeNull();
    expect(describeCodePoint(TWO ** big(64))).toBeNull();
  });
});

describe('formatCodePoint', () => {
  it('uses at least four upper-case hex digits', () => {
    const cases: [number, string][] = [
      [0, 'U+0000'],
      [65, 'U+0041'],
      [0x20ac, 'U+20AC'],
      [0x1f600, 'U+1F600'],
      [0x10ffff, 'U+10FFFF'],
    ];
    for (const [code, expected] of cases) {
      expect(formatCodePoint(big(code))).toBe(expected);
    }
    expect(formatCodePoint(big('😀'.codePointAt(0) ?? -1))).toBe('U+1F600');
  });
});

describe('parseField', () => {
  it('reads the same number from every field, with or without prefixes', () => {
    const cases: [Field, string][] = [
      ['dec', '100'],
      ['dec', '1e2'],
      ['hex', '64'],
      ['hex', '0x64'],
      ['oct', '144'],
      ['oct', '0o144'],
      ['bin', '1100100'],
      ['bin', '0b1100100'],
      ['ones', '01100100'],
      ['twos', '01100100'],
      ['float32', hexToBits('42C80000', 32)],
      ['float64', hexToBits('4059000000000000', 64)],
    ];
    for (const [field, text] of cases) {
      expect(parseField(field, text, 8)).toEqual({ ok: true, value: { integer: big(100), float: 100 } });
    }
  });

  it('reads complements at the selected bit width', () => {
    expect(valueOf('twos', '1111111111111011', 16).integer).toBe(big(-5));
    expect(valueOf('ones', `${'1'.repeat(29)}010`, 32).integer).toBe(big(-5));
  });

  it('reads IEEE 754 patterns as floats and keeps whole values exact', () => {
    expect(valueOf('float32', hexToBits('3DCCCCCD', 32))).toEqual({ integer: null, float: Math.fround(0.1) });
    expect(valueOf('float64', hexToBits('7FEFFFFFFFFFFFFF', 64)).integer).toBe(big(Number.MAX_VALUE));
    expect(valueOf('float32', hexToBits('7F800000', 32))).toEqual({ integer: null, float: Infinity });
    expect(valueOf('float32', hexToBits('7F800001', 32)).float).toBeNaN();
    expect(valueOf('float64', hexToBits('7FF8000000000000', 64)).float).toBeNaN();
    expect(Object.is(valueOf('float64', hexToBits('8000000000000000', 64)).float, -0)).toBe(true);
  });

  it('reports invalid characters for each field', () => {
    const cases: [Field, string, string][] = [
      ['dec', '12a', 'invalidDecimal'],
      ['dec', '0x10', 'invalidDecimal'],
      ['dec', '', 'invalidDecimal'],
      ['hex', 'XYZ', 'invalidHex'],
      ['hex', '0x', 'invalidHex'],
      ['oct', '8', 'invalidOctal'],
      ['bin', '2', 'invalidBinary'],
      ['bin', '0b', 'invalidBinary'],
      ['ones', '0000000a', 'invalidBinary'],
      ['twos', '-0000001', 'invalidBinary'],
      ['float32', '0x3F800000', 'invalidBinary'],
      ['float64', '1.5', 'invalidBinary'],
    ];
    for (const [field, text, error] of cases) {
      expect(parseField(field, text, 8)).toEqual({ ok: false, error });
    }
  });

  it('reports how many bits a fixed-width field has and expects', () => {
    expect(parseField('twos', '1010', 8)).toEqual({ ok: false, error: 'wrongLength', length: 4, expected: 8 });
    expect(parseField('ones', '1'.repeat(9), 8)).toEqual({ ok: false, error: 'wrongLength', length: 9, expected: 8 });
    expect(parseField('twos', '11111011', 16)).toEqual({ ok: false, error: 'wrongLength', length: 8, expected: 16 });
    expect(parseField('float32', '0'.repeat(31), 8)).toEqual({
      ok: false,
      error: 'wrongLength',
      length: 31,
      expected: 32,
    });
    expect(parseField('float64', ` ${'0'.repeat(32)} `, 32)).toEqual({
      ok: false,
      error: 'wrongLength',
      length: 32,
      expected: 64,
    });
  });

  it('ignores surrounding whitespace', () => {
    expect(valueOf('bin', '  101 ').integer).toBe(big(5));
    expect(valueOf('twos', '\t11111111\n').integer).toBe(big(-1));
  });
});

describe('formatField', () => {
  it('shows 100 in every representation', () => {
    const expected: Record<Field, string> = {
      dec: '100',
      hex: '64',
      oct: '144',
      bin: '1100100',
      ones: '01100100',
      twos: '01100100',
      float32: hexToBits('42C80000', 32),
      float64: hexToBits('4059000000000000', 64),
    };
    const value = valueOf('dec', '100');
    for (const field of FIELDS) {
      expect(textOf(field, value)).toBe(expected[field]);
    }
  });

  it('converts hex input like Number.prototype.toString does', () => {
    const value = valueOf('hex', 'DEADBEEF');
    expect(textOf('dec', value)).toBe((0xdeadbeef).toString(10));
    expect(textOf('oct', value)).toBe((0xdeadbeef).toString(8));
    expect(textOf('bin', value)).toBe((0xdeadbeef).toString(2));
    expect(formatField('twos', value, 32)).toEqual({
      ok: false,
      issue: 'outOfRange',
      min: big(-2147483648),
      max: big(2147483647),
    });
  });

  it('shows negative numbers with a sign in each base and as complements', () => {
    const value = valueOf('dec', '-255');
    expect(textOf('hex', value)).toBe((-255).toString(16).toUpperCase());
    expect(textOf('oct', value)).toBe((-255).toString(8));
    expect(textOf('bin', value)).toBe((-255).toString(2));
    expect(textOf('ones', value, 16)).toBe(int32Bits(~255, 16));
    expect(textOf('twos', value, 16)).toBe(int32Bits(-255, 16));
  });

  it('keeps precision for integers past 2^53', () => {
    const value = valueOf('dec', '9007199254740993');
    expect(textOf('hex', value)).toBe(`2${'0'.repeat(12)}1`);
    expect(textOf('oct', value)).toBe(`4${'0'.repeat(16)}1`);
    expect(textOf('bin', value)).toBe(`1${'0'.repeat(52)}1`);
    expect(textOf('float64', value)).toBe(hexToBits('4340000000000000', 64));
    expect(textOf('dec', valueOf('hex', 'FFFFFFFFFFFFFFFF'))).toBe('18446744073709551615');
  });

  it('flags values that do not fit the bit width', () => {
    expect(formatField('twos', valueOf('dec', '128'), 8)).toEqual({
      ok: false,
      issue: 'outOfRange',
      min: big(-128),
      max: big(127),
    });
    expect(formatField('ones', valueOf('dec', '-128'), 8)).toEqual({
      ok: false,
      issue: 'outOfRange',
      min: big(-127),
      max: big(127),
    });
    expect(formatField('twos', valueOf('dec', '128'), 16)).toEqual({ ok: true, text: '0000000010000000' });
  });

  it('leaves integer-only fields empty for fractions, infinities and NaN', () => {
    const values = [
      ...['3.14', '-0.5', '1e-7'].map(text => valueOf('dec', text)),
      valueOf('float32', hexToBits('7F800000', 32)),
      valueOf('float64', hexToBits('7FF8000000000000', 64)),
    ];
    for (const value of values) {
      for (const field of ['hex', 'oct', 'bin', 'ones', 'twos'] as const) {
        expect(formatField(field, value, 8)).toEqual({ ok: false, issue: 'notInteger' });
      }
    }
    expect(textOf('float32', valueOf('dec', '0.1'))).toBe(hexToBits('3DCCCCCD', 32));
    expect(textOf('float64', valueOf('dec', '0.1'))).toBe(hexToBits('3FB999999999999A', 64));
  });

  it('shows the decimal value of an IEEE 754 pattern', () => {
    expect(textOf('dec', valueOf('float32', hexToBits('3DCCCCCD', 32)))).toBe('0.10000000149011612');
    expect(textOf('dec', valueOf('float32', hexToBits('4B800000', 32)))).toBe('16777216');
    expect(textOf('dec', valueOf('float32', hexToBits('FF800000', 32)))).toBe('-Infinity');
    expect(textOf('dec', valueOf('float64', hexToBits('8000000000000000', 64)))).toBe('-0');

    const max = textOf('dec', valueOf('float64', hexToBits('7FEFFFFFFFFFFFFF', 64)));
    expect(max).toBe(big(Number.MAX_VALUE).toString());
    expect(max).toHaveLength(309);
    expect(max.startsWith('17976931348623157')).toBe(true);
  });

  it('round-trips every field through its own text', () => {
    const texts = ['0', '1', '-1', '42', '-128', '127', '255', '-32768', '65535', '-2147483648', '2147483647'];
    let checked = 0;
    for (const text of [...texts, '9007199254740993', '18446744073709551615', '3.14', '-0.1', '1e-7']) {
      const value = valueOf('dec', text, 32);
      for (const field of FIELDS) {
        const formatted = formatField(field, value, 32);
        if (!formatted.ok) continue;
        const back = valueOf(field, formatted.text, 32);
        if (field === 'float32') expect(back.float).toBe(Math.fround(value.float));
        else if (field === 'float64') expect(back.float).toBe(value.float);
        else expect(back).toEqual(value);
        checked++;
      }
    }
    expect(checked).toBe(108);
  });
});
