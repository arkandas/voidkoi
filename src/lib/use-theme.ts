'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { applyTheme, readTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

const THEME_EVENT = 'voidkoi-theme-change';

/*
 * The choice lives in localStorage and on <html class="dark">, which the CSS
 * reads. It is browser state, not React state, so it goes through
 * useSyncExternalStore: correct during hydration, and no effect that writes
 * state on mount.
 */
function subscribe(callback: () => void): () => void {
  // Another tab changing the theme writes the same key.
  const handleStorage = (): void => {
    applyTheme(readTheme());
    callback();
  };

  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useTheme(): { theme: Theme | null; setTheme(next: Theme): void } {
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null);

  // Following the system means following it live, not just at page load.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (): void => applyTheme('system');
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing: the choice still applies for this page.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, setTheme };
}
