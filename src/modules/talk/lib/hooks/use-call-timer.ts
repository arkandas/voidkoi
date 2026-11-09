'use client';

import { useEffect, useState } from 'react';

import type { CallState } from '../call-machine';

/**
 * Seconds since the call connected, ticking once a second while it is live.
 *
 * The elapsed time is derived rather than stored, so there is no state to
 * reset when a call ends and no way for the timer to disagree with the machine.
 */
export function useCallTimer(state: CallState): number {
  const answeredAt = state.status === 'in-call' ? state.answeredAt : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (answeredAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [answeredAt]);

  if (answeredAt === null) return 0;
  return Math.max(0, Math.floor((now - answeredAt) / 1000));
}
