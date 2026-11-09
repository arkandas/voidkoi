const PARAMETER = /;\s*([^\s;=]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;
const EXTENDED_VALUE = /^([^']+)'[^']*'(.*)$/;
const PERCENT_BYTE = /%([0-9a-f]{2})/gi;
const STRAY_PERCENT = /%(?![0-9a-f]{2})/i;

function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  return value.slice(1).replace(/"$/, '').replace(/\\(.)/g, '$1');
}

function decodeExtendedValue(value: string): string | null {
  const match = EXTENDED_VALUE.exec(unquote(value));
  if (!match || STRAY_PERCENT.test(match[2])) return null;

  const [, charset, encoded] = match;

  if (/^utf-8$/i.test(charset)) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }

  if (/^iso-8859-1$/i.test(charset)) {
    return encoded.replace(PERCENT_BYTE, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }

  return null;
}

function sanitize(name: string | null): string | null {
  const cleaned = name?.replace(/[\x00-\x1f\x7f]/g, '').replace(/[\\/]/g, '_').trim();
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : null;
}

export function downloadFilename(contentDisposition: string | null | undefined, fallback: string): string {
  let extended: string | null = null;
  let plain: string | null = null;

  for (const [, name, value] of `;${contentDisposition ?? ''}`.matchAll(PARAMETER)) {
    const key = name.toLowerCase();
    if (key === 'filename*') extended ??= sanitize(decodeExtendedValue(value.trim()));
    else if (key === 'filename') plain ??= sanitize(unquote(value.trim()));
  }

  return extended ?? plain ?? fallback;
}
