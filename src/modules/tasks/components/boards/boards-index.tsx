'use client';

import { Folder, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button, EmptyState, Spinner } from '@/components/ui';
import { LoadFailed } from '@/modules/tasks/components/load-failed';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { boardHref } from '@/modules/tasks/lib/routes';

import { useBoards } from './boards-frame';

/** The boards without one picked: the one open last, or the first. With none yet, a way to make one. */
export function BoardsIndex() {
  const t = useTranslations('tasks.boards');
  const router = useRouter();
  const { boards, failed, reload, create } = useBoards();
  const { lastBoard } = useTasks();
  const pick = boards?.find(board => board.id === lastBoard) ?? boards?.[0] ?? null;

  useEffect(() => {
    if (pick) router.replace(boardHref(pick.id));
  }, [pick, router]);

  if (failed && !boards) return <LoadFailed message={failed} onRetry={reload} className="h-full bg-surface" />;
  if (!boards || pick) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="h-full bg-surface">
      <EmptyState
        className="py-20"
        icon={<Folder size={24} />}
        title={t('empty')}
        action={
          <Button icon={<Plus size={16} />} onClick={create}>
            {t('create.submit')}
          </Button>
        }
      />
    </div>
  );
}
