'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { locales, type Locale } from '@/i18n/config';
import { THEME_ORDER, type Theme } from '@/lib/theme';
import { useLocaleSwitch } from '@/lib/use-locale';
import { useTheme } from '@/lib/use-theme';

import { Segmented } from './segmented';

const THEME_OPTIONS: Array<{ value: Theme; icon: typeof Sun }> = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

/** Each language in its own name, so whoever can't read the current one still finds theirs. */
const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function ThemePicker() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  return (
    <Segmented
      ariaLabel={t('label')}
      stacked
      value={theme}
      onChange={setTheme}
      options={THEME_OPTIONS.map((option) => ({ ...option, label: t(option.value) }))}
    />
  );
}

/** One button that steps through the themes, for the pages outside the app. */
export function ThemeToggle() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0]!;
  const Icon = current.icon;
  const label = t('toggle', { theme: t(current.value) });
  return (
    <button
      type="button"
      onClick={() => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(current.value) + 1) % THEME_ORDER.length]!)}
      title={label}
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-muted hover:text-ink"
    >
      <Icon size={18} />
    </button>
  );
}

export function LanguagePicker() {
  const t = useTranslations('language');
  const { locale, setLocale } = useLocaleSwitch();
  return (
    <Segmented
      ariaLabel={t('label')}
      value={locale}
      onChange={setLocale}
      options={locales.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
    />
  );
}

export function LanguageToggle() {
  const t = useTranslations('language');
  const { locale, setLocale, pending } = useLocaleSwitch();
  const label = t('toggle', { language: LANGUAGE_NAMES[locale] });
  return (
    <button
      type="button"
      onClick={() => setLocale(locales[(locales.indexOf(locale) + 1) % locales.length]!)}
      disabled={pending}
      title={label}
      aria-label={label}
      className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg px-2 text-[13px] font-semibold tracking-wide text-ink-muted uppercase transition-colors hover:bg-muted hover:text-ink disabled:opacity-60"
    >
      {locale}
    </button>
  );
}
