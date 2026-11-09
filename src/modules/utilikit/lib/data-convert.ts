import Papa from 'papaparse';
import { parse as parseToml, stringify as stringifyToml, TomlError } from 'smol-toml';
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml';
import { locateJsonError } from '@/modules/utilikit/lib/json-utils';

export const DATA_FORMATS = ['json', 'yaml', 'toml', 'csv'] as const;
export type DataFormat = (typeof DATA_FORMATS)[number];

export const CSV_DELIMITERS = { comma: ',', semicolon: ';', tab: '\t' } as const;
export type CsvDelimiter = keyof typeof CSV_DELIMITERS | 'auto';

export const FILE_EXTENSIONS: Record<DataFormat, string> = { json: 'json', yaml: 'yaml', toml: 'toml', csv: 'csv' };
export const TOML_ROOT_KEY = 'rows';

export interface DataOptions {
  indent: number;
  delimiter: CsvDelimiter;
  header: boolean;
  typed: boolean;
}

export const DEFAULT_DATA_OPTIONS: DataOptions = { indent: 2, delimiter: 'auto', header: true, typed: true };

export type DataError =
  | { reason: 'syntax'; message: string; line?: number; column?: number }
  | { reason: 'notTabular' }
  | { reason: 'tomlRoot' };

export type DataNote =
  | { kind: 'multipleDocuments'; count: number }
  | { kind: 'wrapped'; key: string }
  | { kind: 'nullsRemoved'; count: number }
  | { kind: 'flattened' };

export type ParseResult = { ok: true; value: unknown; notes: DataNote[] } | { ok: false; error: DataError };
export type StringifyResult = { ok: true; text: string; notes: DataNote[] } | { ok: false; error: DataError };

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}

const syntax = (message: string, line?: number, column?: number): { ok: false; error: DataError } => ({
  ok: false,
  error: { reason: 'syntax', message, line, column },
});

function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text), notes: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { line, column } = locateJsonError(message, text);
    return syntax(message, line, column);
  }
}

function parseYaml(text: string): ParseResult {
  const documents = parseAllDocuments(text);
  if (!Array.isArray(documents)) return { ok: true, value: null, notes: [] };

  for (const document of documents) {
    const [error] = document.errors;
    if (error) return syntax(error.message.split('\n')[0], error.linePos?.[0].line, error.linePos?.[0].col);
  }

  const values = documents.map(document => normalize(document.toJS()));
  return values.length === 1
    ? { ok: true, value: values[0], notes: [] }
    : { ok: true, value: values, notes: [{ kind: 'multipleDocuments', count: values.length }] };
}

function parseTomlText(text: string): ParseResult {
  try {
    return { ok: true, value: normalize(parseToml(text)), notes: [] };
  } catch (error) {
    if (error instanceof TomlError) return syntax(error.message.split('\n')[0], error.line, error.column);
    return syntax(error instanceof Error ? error.message : String(error));
  }
}

function parseCsv(text: string, options: DataOptions): ParseResult {
  const result = Papa.parse<unknown>(text, {
    header: options.header,
    dynamicTyping: options.typed,
    skipEmptyLines: 'greedy',
    delimiter: options.delimiter === 'auto' ? '' : CSV_DELIMITERS[options.delimiter],
  });
  const fatal = result.errors.find(error => error.type === 'Quotes');
  if (!fatal) return { ok: true, value: result.data, notes: [] };

  const before = text.slice(0, Math.max((fatal.index ?? 1) - 1, 0));
  return syntax(fatal.message, before.split('\n').length, before.length - before.lastIndexOf('\n'));
}

export function parseData(text: string, format: DataFormat, options: DataOptions = DEFAULT_DATA_OPTIONS): ParseResult {
  switch (format) {
    case 'json':
      return parseJson(text);
    case 'yaml':
      return parseYaml(text);
    case 'toml':
      return parseTomlText(text);
    case 'csv':
      return parseCsv(text, options);
  }
}

function removeNulls(value: unknown, counter: { count: number }): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => (item === null || item === undefined ? (counter.count++, false) : true)).map(item => removeNulls(item, counter));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === null || item === undefined ? (counter.count++, []) : [[key, removeNulls(item, counter)]]
      )
    );
  }
  return value;
}

function toToml(value: unknown): StringifyResult {
  const notes: DataNote[] = [];
  let root = value;

  if (Array.isArray(root)) {
    root = { [TOML_ROOT_KEY]: root };
    notes.push({ kind: 'wrapped', key: TOML_ROOT_KEY });
  }
  if (!isPlainObject(root)) return { ok: false, error: { reason: 'tomlRoot' } };

  const counter = { count: 0 };
  const cleaned = removeNulls(root, counter) as Plain;
  if (counter.count > 0) notes.push({ kind: 'nullsRemoved', count: counter.count });

  return { ok: true, text: stringifyToml(cleaned), notes };
}

function flatten(value: Plain, prefix: string, into: Plain, flags: { flattened: boolean }) {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(item)) {
      flags.flattened = true;
      flatten(item, path, into, flags);
    } else if (Array.isArray(item)) {
      flags.flattened = true;
      into[path] = JSON.stringify(item);
    } else {
      into[path] = item;
    }
  }
  return into;
}

function toCsv(value: unknown, options: DataOptions): StringifyResult {
  const rows = Array.isArray(value) ? value : isPlainObject(value) ? [value] : null;
  if (!rows) return { ok: false, error: { reason: 'notTabular' } };

  const delimiter = options.delimiter === 'auto' ? ',' : CSV_DELIMITERS[options.delimiter];
  const unparse = (data: unknown) => Papa.unparse(data as Papa.UnparseObject<unknown>, { delimiter, newline: '\n' });

  if (rows.every(Array.isArray)) {
    return { ok: true, text: Papa.unparse(rows as unknown[][], { delimiter, newline: '\n' }), notes: [] };
  }

  const flags = { flattened: false };
  const records = rows.map(row => flatten(isPlainObject(row) ? row : { value: row }, '', {}, flags));
  const fields = [...new Set(records.flatMap(record => Object.keys(record)))];
  const text = unparse({ fields, data: records.map(record => fields.map(field => record[field] ?? '')) });

  return { ok: true, text, notes: flags.flattened ? [{ kind: 'flattened' }] : [] };
}

export function stringifyData(value: unknown, format: DataFormat, options: DataOptions = DEFAULT_DATA_OPTIONS): StringifyResult {
  switch (format) {
    case 'json':
      return { ok: true, text: JSON.stringify(value, null, options.indent) ?? 'null', notes: [] };
    case 'yaml':
      return { ok: true, text: stringifyYaml(value, { indent: options.indent, lineWidth: 0 }), notes: [] };
    case 'toml':
      return toToml(value);
    case 'csv':
      return toCsv(value, options);
  }
}

export function convertData(
  text: string,
  from: DataFormat,
  to: DataFormat,
  options: DataOptions = DEFAULT_DATA_OPTIONS
): StringifyResult {
  const parsed = parseData(text, from, options);
  if (!parsed.ok) return parsed;

  const output = stringifyData(parsed.value, to, options);
  return output.ok ? { ...output, notes: [...parsed.notes, ...output.notes] } : output;
}
