'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { SearchHit } from '@/modules/tasks/lib/api-types';
import { boardHref } from '@/modules/tasks/lib/routes';

/** How long a search result stays outlined where it opened. */
const HIT_MS = 3500;

interface TasksContextValue {
  /** The search result just opened, outlined where it is for a moment. */
  hit: SearchHit | null;
  openHit(hit: SearchHit): void;
  /** The board open last, which Boards goes back to. */
  lastBoard: number | null;
  setLastBoard(id: number | null): void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function useTasks(): TasksContextValue {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used inside the Tasks shell');
  return context;
}

/** What the parts of Tasks share: the search result just opened, and the board open last. */
export function TasksProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [lastBoard, setLastBoard] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const openHit = useCallback(
    (next: SearchHit) => {
      setHit(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHit(null), HIT_MS);
      const href = next.type === 'task' ? boardHref(next.boardId) : next.type === 'todo' ? '/tasks/todo' : '/tasks/sticky-notes';
      if (pathname !== href) router.push(href);
    },
    [pathname, router],
  );

  const value = useMemo(() => ({ hit, openHit, lastBoard, setLastBoard }), [hit, openHit, lastBoard]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}
