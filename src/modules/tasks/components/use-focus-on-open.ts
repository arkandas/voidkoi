'use client';

import { useEffect, useRef } from 'react';

/**
 * A field to focus each time its dialog opens. The dialog only shows once it
 * has opened, so this waits a frame instead of relying on autoFocus.
 */
export function useFocusOnOpen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return ref;
}
