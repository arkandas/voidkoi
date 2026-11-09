'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Spinner } from '@/components/ui';
import type { NoteDto } from '@/modules/notes/lib/api-types';

/** Notes in the trash, to bring back or delete for good. */
export function TrashList({
  notes,
  formatDate,
  onRestore,
  onDelete,
}: {
  notes: NoteDto[] | null;
  formatDate(iso: string): string;
  onRestore(note: NoteDto): void;
  onDelete(note: NoteDto): void;
}) {
  const t = useTranslations('notes');

  if (notes === null) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size={18} />
      </div>
    );
  }

  if (notes.length === 0) return <p className="px-1 py-6 text-center text-xs text-ink-muted">{t('trash.nothing')}</p>;

  return (
    <ul className="flex flex-col gap-1 px-2 pt-1">
      {notes.map(note => (
        <li key={note.id} className="rounded-lg border border-line bg-raised px-3 py-2 dark:bg-card">
          <div className="truncate text-sm font-medium text-ink">{note.title || t('untitled')}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{t('trash.deletedOn', { date: note.deletedAt ? formatDate(note.deletedAt) : '' })}</div>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRestore(note)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-muted hover:text-ink"
            >
              <RotateCcw size={12} />
              {t('trash.restore')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(note)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-danger transition-colors hover:bg-danger-soft"
            >
              <Trash2 size={12} />
              {t('trash.deleteForever')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
