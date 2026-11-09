import { describe, expect, it } from 'vitest';
import { convertData, DEFAULT_DATA_OPTIONS, parseData, stringifyData } from '@/modules/utilikit/lib/data-convert';

const config = {
  name: 'utilikit',
  port: 3000,
  debug: false,
  server: { host: '0.0.0.0', tags: ['a', 'b'] },
  users: [
    { name: 'Ana', admin: true },
    { name: 'Bob', admin: false },
  ],
};

describe('parseData', () => {
  it('reads every format into the same value', () => {
    const json = JSON.stringify(config);
    const yaml = stringifyData(config, 'yaml');
    const toml = stringifyData(config, 'toml');
    expect(parseData(json, 'json')).toMatchObject({ ok: true, value: config });
    expect(yaml.ok && parseData(yaml.text, 'yaml')).toMatchObject({ ok: true, value: config });
    expect(toml.ok && parseData(toml.text, 'toml')).toMatchObject({ ok: true, value: config });
  });

  it('points at the line and column of JSON errors', () => {
    expect(parseData('{\n  "a": 1\n  "b": 2\n}', 'json')).toMatchObject({ ok: false, error: { reason: 'syntax', line: 3, column: 3 } });
  });

  it('points at the line of YAML and TOML errors', () => {
    expect(parseData('a: [1, 2\nb: 3', 'yaml')).toMatchObject({ ok: false, error: { reason: 'syntax', line: 2 } });
    expect(parseData('a = \nb = 2', 'toml')).toMatchObject({ ok: false, error: { reason: 'syntax', line: 1 } });
  });

  it('turns several YAML documents into a list', () => {
    expect(parseData('a: 1\n---\nb: 2', 'yaml')).toEqual({
      ok: true,
      value: [{ a: 1 }, { b: 2 }],
      notes: [{ kind: 'multipleDocuments', count: 2 }],
    });
  });

  it('keeps TOML dates as they were written', () => {
    expect(parseData('day = 1979-05-27\ntime = 07:32:00', 'toml')).toMatchObject({
      ok: true,
      value: { day: '1979-05-27', time: '07:32:00.000' },
    });
  });

  it('reads CSV with a header, quotes and types', () => {
    expect(parseData('name,age,ok\n"Doe, J",30,true\nAna,,false\n', 'csv')).toMatchObject({
      ok: true,
      value: [
        { name: 'Doe, J', age: 30, ok: true },
        { name: 'Ana', age: null, ok: false },
      ],
    });
  });

  it('reads CSV as plain text rows when asked', () => {
    expect(parseData('a;b\n1;2', 'csv', { ...DEFAULT_DATA_OPTIONS, header: false, typed: false })).toMatchObject({
      ok: true,
      value: [
        ['a', 'b'],
        ['1', '2'],
      ],
    });
  });

  it('reports an unterminated CSV quote', () => {
    expect(parseData('a,b\n1,2\n"x,1', 'csv')).toMatchObject({ ok: false, error: { reason: 'syntax', line: 3, column: 1 } });
  });
});

describe('stringifyData', () => {
  it('writes JSON and YAML with the chosen indentation', () => {
    expect(stringifyData({ a: { b: 1 } }, 'json', { ...DEFAULT_DATA_OPTIONS, indent: 4 })).toMatchObject({ text: '{\n    "a": {\n        "b": 1\n    }\n}' });
    expect(stringifyData({ a: { b: 1 } }, 'yaml', { ...DEFAULT_DATA_OPTIONS, indent: 4 })).toMatchObject({ text: 'a:\n    b: 1\n' });
  });

  it('does not fold long YAML strings', () => {
    const long = 'word '.repeat(40).trim();
    expect(stringifyData({ long }, 'yaml')).toMatchObject({ text: `long: ${long}\n` });
  });

  it('puts a top-level list under a key for TOML', () => {
    const result = stringifyData([{ a: 1 }], 'toml');
    expect(result).toEqual({ ok: true, text: '[[rows]]\na = 1\n', notes: [{ kind: 'wrapped', key: 'rows' }] });
  });

  it('leaves out empty values in TOML and says how many', () => {
    const result = stringifyData({ a: null, b: 1, list: [1, null], nested: { c: null } }, 'toml');
    expect(result).toMatchObject({ ok: true, notes: [{ kind: 'nullsRemoved', count: 3 }] });
    expect(result.ok && parseData(result.text, 'toml')).toMatchObject({ value: { b: 1, list: [1], nested: {} } });
  });

  it('refuses a single value for TOML and CSV', () => {
    expect(stringifyData(42, 'toml')).toEqual({ ok: false, error: { reason: 'tomlRoot' } });
    expect(stringifyData('text', 'csv')).toEqual({ ok: false, error: { reason: 'notTabular' } });
  });

  it('writes objects as CSV rows, flattening nested values', () => {
    const result = stringifyData(
      [
        { name: 'Ana', address: { city: 'Madrid' }, tags: ['x', 'y'] },
        { name: 'Bob, Jr.', extra: true },
      ],
      'csv'
    );
    expect(result).toEqual({
      ok: true,
      text: 'name,address.city,tags,extra\nAna,Madrid,"[""x"",""y""]",\n"Bob, Jr.",,,true',
      notes: [{ kind: 'flattened' }],
    });
  });

  it('writes rows of lists as they are, with the chosen delimiter', () => {
    expect(stringifyData([['a', 'b'], [1, 2]], 'csv', { ...DEFAULT_DATA_OPTIONS, delimiter: 'semicolon' })).toMatchObject({ text: 'a;b\n1;2' });
  });
});

describe('convertData', () => {
  it('converts CSV to JSON', () => {
    expect(convertData('id,name\n1,Ana', 'csv', 'json')).toMatchObject({ ok: true, text: '[\n  {\n    "id": 1,\n    "name": "Ana"\n  }\n]' });
  });

  it('converts YAML to TOML', () => {
    expect(convertData('title: Hi\nowner:\n  name: Tom\n', 'yaml', 'toml')).toMatchObject({ ok: true, text: 'title = "Hi"\n\n[owner]\nname = "Tom"\n' });
  });

  it('passes parse errors through', () => {
    expect(convertData('{', 'json', 'yaml')).toMatchObject({ ok: false, error: { reason: 'syntax' } });
  });
});
