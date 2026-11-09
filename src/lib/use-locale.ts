'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';

import { LOCALE_COOKIE, type Locale } from '@/i18n/config';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Switch language. The choice lives in a cookie rather than the URL, so every
 * link stays the same and the api, on the same site, reads it too.
 */
export function useLocaleSwitch() {
  const router = useRouter();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  return { locale, setLocale, pending };
}
