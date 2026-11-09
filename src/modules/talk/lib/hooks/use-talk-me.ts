'use client';

import { useMemo } from 'react';

import { useMe } from '@/components/me';

import type { TalkPerson } from '../protocol';

/** The signed-in account, as Talk shows people: its name, or its username when it has none. */
export function useTalkMe(): TalkPerson {
  const me = useMe();
  return useMemo(() => ({ id: me.id, username: me.username, displayName: me.name ?? me.username, avatar: me.avatar }), [me.id, me.username, me.name, me.avatar]);
}
