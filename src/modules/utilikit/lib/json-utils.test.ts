import { describe, expect, it } from 'vitest';
import { formatJSON, locateJsonError, minifyJSON, sortJSONKeys, validateJSON } from '@/modules/utilikit/lib/json-utils';

const SAMPLE = '{"a":[1,{"b":null}],"c":"x"}';

describe('formatJSON', () => {
  it('indents with two spaces by default', () => {
    expect(formatJSON(SAMPLE)).toEqual({
      valid: true,
      output: '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ],\n  "c": "x"\n}',
    });
  });

  it('indents with four spaces', () => {
    expect(formatJSON(SAMPLE, 4)).toEqual({
      valid: true,
      output: '{\n    "a": [\n        1,\n        {\n            "b": null\n        }\n    ],\n    "c": "x"\n}',
    });
  });

  it('indents with tabs', () => {
    expect(formatJSON(SAMPLE, '\t')).toEqual({
      valid: true,
      output: '{\n\t"a": [\n\t\t1,\n\t\t{\n\t\t\t"b": null\n\t\t}\n\t],\n\t"c": "x"\n}',
    });
  });

  it('formats top-level primitives and empty containers', () => {
    expect(formatJSON(' "text" ')).toEqual({ valid: true, output: '"text"' });
    expect(formatJSON('null')).toEqual({ valid: true, output: 'null' });
    expect(formatJSON('{ }')).toEqual({ valid: true, output: '{}' });
    expect(formatJSON('[ ]')).toEqual({ valid: true, output: '[]' });
  });

  it('decodes unicode escapes and re-escapes only what JSON requires', () => {
    expect(formatJSON('{"e":"\\u00e9","emoji":"\\ud83d\\ude00","nul":"\\u0000","slash":"\\/"}')).toEqual({
      valid: true,
      output: '{\n  "e": "é",\n  "emoji": "😀",\n  "nul": "\\u0000",\n  "slash": "/"\n}',
    });
  });

  it('keeps lone surrogates escaped so the output stays valid UTF-8', () => {
    expect(minifyJSON('["\\udc00"]')).toEqual({ valid: true, output: '["\\udc00"]' });
  });

  it('handles deep nesting', () => {
    const depth = 1000;
    const input = '['.repeat(depth) + ']'.repeat(depth);
    const result = formatJSON(input);
    expect(result.valid && result.output.split('\n')).toHaveLength(2 * depth - 1);
    expect(minifyJSON(input)).toEqual({ valid: true, output: input });
  });

  it('reports nesting too deep to serialise instead of throwing', () => {
    const depth = 200_000;
    const result = formatJSON('['.repeat(depth) + ']'.repeat(depth));
    expect(result.valid).toBe(false);
    expect(!result.valid && result.error.reason).toBe('tooLarge');
  });

  it('keeps integers beyond Number.MAX_SAFE_INTEGER exactly as written', () => {
    expect(minifyJSON('9007199254740993')).toEqual({ valid: true, output: '9007199254740993' });
    expect(formatJSON('{"id":12345678901234567890,"neg":-98765432109876543210}')).toEqual({
      valid: true,
      output: '{\n  "id": 12345678901234567890,\n  "neg": -98765432109876543210\n}',
    });
  });

  it('keeps number literals exactly as written', () => {
    expect(minifyJSON('[1.0, 1e3, -0, 0.10, 1E-7, 0.1000000000000000055511151231257827]')).toEqual({
      valid: true,
      output: '[1.0,1e3,-0,0.10,1E-7,0.1000000000000000055511151231257827]',
    });
  });

  it('keeps large numbers intact when sorting keys', () => {
    expect(sortJSONKeys('{"b":{"id":9007199254740993},"a":[18446744073709551615]}', 0)).toEqual({
      valid: true,
      output: '{"a":[18446744073709551615],"b":{"id":9007199254740993}}',
    });
  });

  it('keeps only the last of duplicate keys', () => {
    expect(minifyJSON('{"a":1,"a":2}')).toEqual({ valid: true, output: '{"a":2}' });
  });

  it('moves integer-like keys first, as JavaScript objects do', () => {
    expect(minifyJSON('{"b":1,"10":2,"a":3,"9":4}')).toEqual({ valid: true, output: '{"9":4,"10":2,"b":1,"a":3}' });
  });
});

describe('minifyJSON', () => {
  it('removes whitespace between tokens but not inside strings', () => {
    expect(minifyJSON('{\n  "a" : [ 1 , 2 ],\n\t"s" : "a  b\\n"\n}')).toEqual({
      valid: true,
      output: '{"a":[1,2],"s":"a  b\\n"}',
    });
  });

  it('round-trips formatted output', () => {
    const formatted = formatJSON(SAMPLE, 4);
    expect(formatted.valid && minifyJSON(formatted.output)).toEqual({ valid: true, output: SAMPLE });
  });
});

describe('sortJSONKeys', () => {
  it('sorts keys at every level and keeps array order', () => {
    expect(sortJSONKeys('{"b":1,"a":{"d":[{"z":1,"y":2},3],"c":true}}', 0)).toEqual({
      valid: true,
      output: '{"a":{"c":true,"d":[{"y":2,"z":1},3]},"b":1}',
    });
  });

  it('sorts by UTF-16 code unit, so capitals come before lowercase', () => {
    expect(sortJSONKeys('{"b":1,"a":2,"B":3,"_":4}', 0)).toEqual({ valid: true, output: '{"B":3,"_":4,"a":2,"b":1}' });
  });

  it('uses the requested indentation', () => {
    expect(sortJSONKeys('{"b":1,"a":2}', '\t')).toEqual({ valid: true, output: '{\n\t"a": 2,\n\t"b": 1\n}' });
  });

  it('keeps a "__proto__" key as data', () => {
    expect(sortJSONKeys('{"z":0,"__proto__":{"x":1}}', 0)).toEqual({
      valid: true,
      output: '{"__proto__":{"x":1},"z":0}',
    });
  });
});

describe('validateJSON', () => {
  it('accepts every JSON value type', () => {
    for (const input of ['{}', '[]', '"x"', '0', '-1.5e10', 'true', 'false', 'null', ' \n[1, "2", {"3": null}]\t']) {
      expect(validateJSON(input)).toEqual({ valid: true });
    }
  });

  it('rejects a trailing comma in an object and locates it', () => {
    expect(validateJSON('{"a":1,}')).toMatchObject({
      valid: false,
      error: { reason: 'syntax', position: 7, line: 1, column: 8 },
    });
  });

  it('rejects a trailing comma in an array', () => {
    const result = validateJSON('[1,2,]');
    expect(result.valid).toBe(false);
    expect(!result.valid && result.error.message).not.toBe('');
  });

  it('rejects single quotes and unquoted keys at the offending character', () => {
    expect(validateJSON("{'a': 1}")).toMatchObject({ valid: false, error: { position: 1, line: 1, column: 2 } });
    expect(validateJSON('{a: 1}')).toMatchObject({ valid: false, error: { position: 1, line: 1, column: 2 } });
  });

  it('rejects comments, NaN and empty input', () => {
    expect(validateJSON('{"a":1 // note\n}').valid).toBe(false);
    expect(validateJSON('[NaN]').valid).toBe(false);
    expect(validateJSON('').valid).toBe(false);
  });

  it('reports line and column on multi-line input, matching the engine', () => {
    const result = validateJSON('{\n  "a": 1,\n}');
    expect(result).toMatchObject({ valid: false, error: { position: 12, line: 3, column: 1 } });
    expect(!result.valid && result.error.message).toContain('line 3 column 1');
  });

  it('keeps the raw engine message', () => {
    const result = validateJSON('[1]x');
    expect(!result.valid && result.error.message).toMatch(/position 3/);
  });

  it('returns the same errors from every operation', () => {
    const invalid = '{"a":1,}';
    const expected = validateJSON(invalid);
    expect(formatJSON(invalid)).toEqual(expected);
    expect(minifyJSON(invalid)).toEqual(expected);
    expect(sortJSONKeys(invalid)).toEqual(expected);
  });
});

describe('locateJsonError', () => {
  const input = '[\n  1,\n  2,,\n]';

  it('reads V8 positions and derives line and column', () => {
    expect(locateJsonError("Unexpected token ',', ... in JSON at position 11 (line 3 column 5)", input)).toEqual({
      position: 11,
      line: 3,
      column: 5,
    });
    expect(locateJsonError('Unexpected token , in JSON at position 11', input)).toEqual({
      position: 11,
      line: 3,
      column: 5,
    });
    expect(locateJsonError('Unexpected token in JSON at position 0', input)).toEqual({
      position: 0,
      line: 1,
      column: 1,
    });
  });

  it('reads Firefox line and column and derives the position', () => {
    expect(
      locateJsonError("JSON.parse: expected property name or '}' at line 3 column 5 of the JSON data", input)
    ).toEqual({ position: 11, line: 3, column: 5 });
    expect(locateJsonError('JSON.parse: unexpected character at line 1 column 1 of the JSON data', input)).toEqual({
      position: 0,
      line: 1,
      column: 1,
    });
  });

  it('returns no location when the engine gives none', () => {
    expect(locateJsonError('JSON Parse error: Unexpected comma at the end of array expression', input)).toEqual({});
    expect(locateJsonError('Unexpected end of JSON input', input)).toEqual({});
  });
});
