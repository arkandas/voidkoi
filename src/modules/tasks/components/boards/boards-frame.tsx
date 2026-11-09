'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import { X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useApiError } from '@/lib/use-api-error';
import { parseId } from '@/lib/validate';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { api, type BoardInput } from '@/modules/tasks/lib/api';
import type { BoardDto } from '@/modules/tasks/lib/api-types';
import { boardHref } from '@/modules/tasks/lib/routes';
import { moveItem } from '@/modules/tasks/lib/validate';

import { CreateBoardDialog } from './board-form-dialogs';
import { BoardSidebar } from './board-sidebar';

interface BoardsContextValue {
  /** The account's boards in its order, null until they load. */
  boards: BoardDto[] | null;
  /** Why they didn't load. */
  failed: string | null;
  reload(): void;
  /** A board's new title or description, for the list. */
  changed(board: BoardDto): void;
  /** A board just deleted: off the list, and the next one opens. */
  removed(id: number): void;
  create(): void;
  /** On a phone, where the list is a drawer: open it. */
  showList(): void;
}

const BoardsContext = createContext<BoardsContextValue | null>(null);

export function useBoards(): BoardsContextValue {
  const context = useContext(BoardsContext);
  if (!context) throw new Error('useBoards must be used inside the boards frame');
  return context;
}

/** The boards: the list down the side, or in a drawer on a phone, and the open board beside it. */
export function BoardsFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('tasks.boards');
  const tApp = useTranslations('tasks.app');
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const openId = params.id ? parseId(params.id) : null;
  const toast = useToast();
  const apiError = useApiError();
  const { setLastBoard } = useTasks();
  const [boards, setBoards] = useState<BoardDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(count => count + 1), []);

  useEffect(() => {
    let current = true;
    api.boards().then(
      loaded => {
        if (!current) return;
        setBoards(loaded);
        setFailed(null);
      },
      error => {
        if (current) setFailed(apiError(error, 'loadFailed'));
      },
    );
    return () => {
      current = false;
    };
  }, [apiError, attempt]);

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer]);

  const select = useCallback(
    (id: number) => {
      setDrawer(false);
      if (id !== openId) router.push(boardHref(id));
    },
    [openId, router],
  );

  const reorder = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;
    if (!boards || !over || active.id === over.id) return;
    const from = boards.findIndex(board => board.id === active.id);
    const to = boards.findIndex(board => board.id === over.id);
    if (from === -1 || to === -1) return;
    const before = boards;
    setBoards(moveItem(boards, from, to));
    try {
      await api.moveBoard(active.id as number, to);
    } catch (error) {
      setBoards(before);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const createBoard = async (input: BoardInput): Promise<void> => {
    try {
      const board = await api.createBoard(input);
      setBoards(current => [...(current ?? []), board]);
      setCreating(false);
      router.push(boardHref(board.id));
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const value = useMemo<BoardsContextValue>(
    () => ({
      boards,
      failed,
      reload,
      changed: board => setBoards(current => current?.map(other => (other.id === board.id ? { ...other, ...board } : other)) ?? null),
      removed: id => {
        const rest = (boards ?? []).filter(board => board.id !== id);
        setBoards(rest);
        setLastBoard(null);
        router.replace(rest[0] ? boardHref(rest[0].id) : '/tasks/boards');
      },
      create: () => {
        setDrawer(false);
        setCreating(true);
      },
      showList: () => setDrawer(true),
    }),
    [boards, failed, reload, router, setLastBoard],
  );

  const sidebar = (onOpened?: () => void) => (
    <BoardSidebar
      boards={boards ?? []}
      openId={openId}
      onReorder={event => void reorder(event)}
      onSelect={select}
      onCreate={value.create}
      onOpened={onOpened}
    />
  );

  return (
    <BoardsContext.Provider value={value}>
      <div className="flex h-full">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-canvas md:flex">{sidebar()}</aside>

        <div className={cn('fixed inset-0 z-40 md:hidden', !drawer && 'pointer-events-none')}>
          <div
            onClick={() => setDrawer(false)}
            className={cn('absolute inset-0 bg-scrim transition-opacity duration-300', drawer ? 'opacity-100' : 'opacity-0')}
          />
          <div
            role="dialog"
            aria-label={tApp('boards')}
            className={cn(
              'absolute inset-y-0 left-0 flex w-[84%] max-w-[320px] flex-col bg-surface shadow-2xl transition-[transform,visibility] duration-300 ease-out',
              drawer ? 'visible translate-x-0' : 'invisible -translate-x-full',
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
              <span className="text-base font-bold tracking-tight text-ink">{tApp('boards')}</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="flex size-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-muted hover:text-ink"
                aria-label={t('closeList')}
              >
                <X size={18} />
              </button>
            </div>
            {sidebar(() => setDrawer(false))}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>
      <CreateBoardDialog open={creating} onClose={() => setCreating(false)} onCreate={createBoard} />
    </BoardsContext.Provider>
  );
}
