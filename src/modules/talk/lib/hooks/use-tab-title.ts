'use client';

import { useEffect } from 'react';

/**
 * Alternate the tab title while something needs attention, so an incoming call
 * is visible from another tab. Restores the original title on the way out.
 */
export function useAlternatingTitle(active: boolean, alternate: string): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const original = document.title;
    let showingAlternate = false;

    const tick = (): void => {
      showingAlternate = !showingAlternate;
      document.title = showingAlternate ? alternate : original;
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [active, alternate]);
}
