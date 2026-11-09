export type JsonIndent = number | string;

export interface JsonError {
  reason: 'syntax' | 'tooLarge';
  message: string;
  line?: number;
  column?: number;
  position?: number;
}

export type JsonErrorLocation = Pick<JsonError, 'line' | 'column' | 'position'>;
export type JsonValidation = { valid: true } | { valid: false; error: JsonError };
export type JsonOutputResult = { valid: true; output: string } | { valid: false; error: JsonError };
type JsonParseResult = { valid: true; value: unknown } | { valid: false; error: JsonError };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function locateJsonError(message: string, input: string): JsonErrorLocation {
  const position = /at position (\d+)/.exec(message);
  if (position) {
    const offset = Number(position[1]);
    const before = input.slice(0, offset);
    return { position: offset, line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
  }

  const lineColumn = /line (\d+) column (\d+)/.exec(message);
  if (lineColumn) {
    const line = Number(lineColumn[1]);
    const column = Number(lineColumn[2]);
    const lineStart = input.split('\n', line - 1).reduce((offset, text) => offset + text.length + 1, 0);
    return { line, column, position: lineStart + column - 1 };
  }

  return {};
}

type RawJSON = { readonly rawJSON: string };

const nativeJSON = JSON as JSON & {
  rawJSON?: (text: string) => RawJSON;
  isRawJSON?: (value: unknown) => value is RawJSON;
};

function keepNumberSource(_key: string, value: unknown, context?: { source?: string }): unknown {
  return typeof value === 'number' && context?.source && nativeJSON.rawJSON ? nativeJSON.rawJSON(context.source) : value;
}

function parseJSON(input: string): JsonParseResult {
  try {
    return { valid: true, value: JSON.parse(input, keepNumberSource) };
  } catch (error) {
    const message = errorMessage(error);
    if (error instanceof RangeError) return { valid: false, error: { reason: 'tooLarge', message } };
    return { valid: false, error: { reason: 'syntax', message, ...locateJsonError(message, input) } };
  }
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value === null || typeof value !== 'object' || nativeJSON.isRawJSON?.(value)) return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, sortObjectKeys(record[key])])
  );
}

function serialize(input: string, indent?: JsonIndent, sortKeys = false): JsonOutputResult {
  const parsed = parseJSON(input);
  if (!parsed.valid) return parsed;

  try {
    const value = sortKeys ? sortObjectKeys(parsed.value) : parsed.value;
    return { valid: true, output: JSON.stringify(value, null, indent) };
  } catch (error) {
    return { valid: false, error: { reason: 'tooLarge', message: errorMessage(error) } };
  }
}

export function formatJSON(input: string, indent: JsonIndent = 2): JsonOutputResult {
  return serialize(input, indent);
}

export function minifyJSON(input: string): JsonOutputResult {
  return serialize(input);
}

export function sortJSONKeys(input: string, indent: JsonIndent = 2): JsonOutputResult {
  return serialize(input, indent, true);
}

export function validateJSON(input: string): JsonValidation {
  const parsed = parseJSON(input);
  return parsed.valid ? { valid: true } : parsed;
}
