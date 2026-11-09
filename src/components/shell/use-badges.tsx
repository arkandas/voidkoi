'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { request } from '@/lib/api';
import type { AppId } from '@/modules/types';

type Badges = Partial<Record<AppId, number>>;

declare global {
  interface Window {
    /** Present inside the Mac app, which shows the total on its Dock icon. */
    webkit?: { messageHandlers?: { voidkoi?: { postMessage(message: unknown): void } } };
  }
}

/** How often the counts are read. */
const EVERY = 30_000;

const BadgesContext = createContext<Badges | null>(null);

/**
 * What is new in each app, read once for the whole page, however many places show it: now and then, and on coming
 * back to the page.
 */
export function BadgesProvider({ children }: { children: ReactNode }) {
  const [badges, setBadges] = useState<Badges>({});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async (): Promise<void> => {
      if (document.visibilityState === 'visible') {
        try {
          const next = await request<Badges>('GET', '/badges');
          if (!alive) return;
          setBadges(next);
          const total = Object.values(next).reduce((sum, count) => sum + (count ?? 0), 0);
          window.webkit?.messageHandlers?.voidkoi?.postMessage({ type: 'badge', count: total });
        } catch {
          // The next look tries again.
        }
      }
      if (!alive) return;
      // One look waiting at a time, however many were asked for.
      clearTimeout(timer);
      timer = setTimeout(() => void look(), EVERY);
    };
    void look();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void look();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <BadgesContext.Provider value={badges}>{children}</BadgesContext.Provider>;
}

const NONE: Badges = {};

/** The counts on the apps' icons. */
export function useBadges(): Badges {
  return useContext(BadgesContext) ?? NONE;
}

export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
