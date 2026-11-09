'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/modules/files/lib/api';
import type { FilesStatusDto } from '@/modules/files/lib/api-types';

interface FilesStatusValue {
  status: FilesStatusDto | null;
  /** Read it again, e.g. after an upload changed how much space is used. */
  refresh(): Promise<void>;
}

const FilesStatusContext = createContext<FilesStatusValue | null>(null);

/** What Files knows about the account: storage used, its limits, and what was shared with it lately. */
export function FilesStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<FilesStatusDto | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch {
      // The next look, on a timer or on coming back, tries again.
    }
  }, []);

  // Shares and storage change while Files is open: look again now and then, and on coming back to it.
  // The first look is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.status().then(
      found => {
        if (!cancelled) setStatus(found);
      },
      () => {},
    );
    const again = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(again, 60_000);
    document.addEventListener('visibilitychange', again);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
  }, [refresh]);

  return <FilesStatusContext.Provider value={{ status, refresh }}>{children}</FilesStatusContext.Provider>;
}

export function useFilesStatus(): FilesStatusValue {
  const context = useContext(FilesStatusContext);
  if (!context) throw new Error('useFilesStatus must be used inside Files');
  return context;
}
