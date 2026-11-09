export const locales = ['en', 'es'] as const;
export const defaultLocale: Locale = 'en';
export const LOCALE_COOKIE = 'voidkoi-locale';

export type Locale = (typeof locales)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function resolveLocale(cookieValue?: string | null, acceptLanguage?: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;

  const preferred = (acceptLanguage ?? '')
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params.map(param => param.trim().match(/^q=([\d.]+)$/)?.[1]).find(Boolean);
      return { language: tag.trim().toLowerCase().split('-')[0], quality: quality ? parseFloat(quality) : 1 };
    })
    .filter(entry => entry.language && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  return preferred.map(entry => entry.language).find(isLocale) ?? defaultLocale;
}
