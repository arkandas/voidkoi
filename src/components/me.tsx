'use client';

import { signOut } from 'next-auth/react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import type { MeDto } from '@/lib/api-types';
import { ApiError } from '@/lib/error-codes';

interface MeContextValue {
  me: MeDto | null;
  /** The account didn't load: the server didn't answer in time, or answered with an error. It's asked again on its own. */
  failed: boolean;
  /** Ask for the account again now, after it failed. */
  retry(): void;
  /** Read the account again, e.g. after its apps changed. */
  refresh(): Promise<void>;
  setMe(me: MeDto): void;
}

const MeContext = createContext<MeContextValue | null>(null);

/** How long the account may take before the page says it didn't load. */
const LOAD_TIMEOUT = 15_000;
/** The waits between tries while it fails: a server restarting or a network coming back shouldn't need a reload. */
const RETRY_AFTER = [2_000, 5_000, 10_000, 20_000, 30_000];

const signedOut = (error: unknown) => error instanceof ApiError && error.status === 401;

/** The signed-in account and its apps. An account that no longer exists signs out. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeDto | null>(null);
  const [failed, setFailed] = useState(false);
  // Changed to start the first look over at once.
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
      setFailed(false);
    } catch (error) {
      if (signedOut(error)) await signOut({ callbackUrl: '/login' });
    }
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt(value => value + 1);
  }, []);

  // The first look, and while it fails, more after a while. The state is set once an answer is back, not while
  // the effect runs.
  useEffect(() => {
    if (me) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const look = (): void => {
      api.me(AbortSignal.timeout(LOAD_TIMEOUT)).then(
        found => {
          if (cancelled) return;
          setMe(found);
          setFailed(false);
        },
        async (error: unknown) => {
          if (cancelled) return;
          if (signedOut(error)) {
            await signOut({ callbackUrl: '/login' });
            return;
          }
          setFailed(true);
          timer = setTimeout(look, RETRY_AFTER[Math.min(tries++, RETRY_AFTER.length - 1)]);
        },
      );
    };
    look();
    const online = (): void => {
      clearTimeout(timer);
      look();
    };
    window.addEventListener('online', online);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', online);
    };
    // `me` only goes from nothing to an account, so this runs until the first one arrives.
  }, [me, attempt]);

  // Apps and the profile can change in another tab: look again on coming back.
  useEffect(() => {
    const again = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [refresh]);

  return <MeContext.Provider value={{ me, failed, retry, refresh, setMe }}>{children}</MeContext.Provider>;
}

export function useMeContext(): MeContextValue {
  const context = useContext(MeContext);
  if (!context) throw new Error('useMeContext must be used inside a MeProvider');
  return context;
}

/** The account, once loaded. The app shell doesn't render pages before that. */
export function useMe(): MeDto {
  const { me } = useMeContext();
  if (!me) throw new Error('useMe was called before the account loaded');
  return me;
}
