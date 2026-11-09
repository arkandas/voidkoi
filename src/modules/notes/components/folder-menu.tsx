'use client';

import {
  BookOpen, Bookmark, Briefcase, Code2, FileText, FlaskConical, Folder, Heart, Lightbulb, Pencil, Pin, Plus, Star, Target, Trash2, X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createElement, useEffect, useRef, type CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import type { FolderChanges } from '@/modules/notes/lib/api-types';
import { FOLDER_COLORS, FOLDER_ICONS, type FolderColor, type FolderIcon } from '@/modules/notes/lib/folders';

const ICONS: Record<FolderIcon, LucideIcon> = {
  folder: Folder,
  note: FileText,
  star: Star,
  pin: Pin,
  bookmark: Bookmark,
  idea: Lightbulb,
  lab: FlaskConical,
  book: BookOpen,
  target: Target,
  work: Briefcase,
  heart: Heart,
  code: Code2,
};

export function FolderGlyph({ icon, size, className, style }: { icon?: string | null; size: number; className?: string; style?: CSSProperties }) {
  const Icon = (icon && ICONS[icon as FolderIcon]) || Folder;
  return createElement(Icon, { size, className, style, 'aria-hidden': true });
}

/** A folder's colour as CSS: the swatch, and the darker or lighter shade its text is drawn in. */
export function swatchOf(color: FolderColor): string {
  return `var(--folder-${color})`;
}

export function inkOf(color: FolderColor): string {
  return `var(--folder-${color}-ink)`;
}

const itemClasses =
  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors focus:outline-hidden';

/** Under a folder: its colour, its icon, and what can be done with it. */
export function FolderMenu({
  color,
  icon,
  onChange,
  onNewNote,
  onRename,
  onDelete,
  onClose,
}: {
  color: FolderColor | null;
  icon: string | null;
  onChange(changes: FolderChanges): void;
  onNewNote(): void;
  onRename(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const t = useTranslations('notes.folder');
  const panelRef = useRef<HTMLDivElement>(null);

  // A folder low in the list opens its menu below the fold: bring it up.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('menu')}
        className="absolute top-full right-2 left-2 z-20 mt-1 rounded-xl border border-line-strong bg-(--menu) p-3 text-ink shadow-xl [--menu:var(--raised)] dark:[--menu:var(--surface)]"
      >
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">{t('color')}</p>
        <div className="mb-3 grid grid-cols-7 justify-items-center gap-1.5">
          {FOLDER_COLORS.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => onChange({ color: name })}
              title={t(`colors.${name}`)}
              aria-label={t(`colors.${name}`)}
              aria-pressed={color === name}
              className="size-6 rounded-full transition-transform hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
              style={{
                backgroundColor: swatchOf(name),
                boxShadow: color === name ? `0 0 0 2px var(--menu), 0 0 0 4px ${swatchOf(name)}` : undefined,
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => onChange({ color: null })}
            title={t('noColor')}
            aria-label={t('noColor')}
            aria-pressed={color === null}
            className="flex size-6 items-center justify-center rounded-full border border-line-strong text-ink-muted transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X size={11} />
          </button>
        </div>

        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">{t('icon')}</p>
        <div className="mb-3 grid grid-cols-6 gap-1">
          {FOLDER_ICONS.map(key => {
            const active = key === 'folder' ? !icon || icon === 'folder' : icon === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ icon: key === 'folder' ? null : key })}
                title={t(`icons.${key}`)}
                aria-label={t(`icons.${key}`)}
                aria-pressed={active}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent',
                  active ? 'bg-muted text-accent ring-1 ring-accent' : 'text-ink-muted hover:text-ink',
                )}
              >
                <FolderGlyph icon={key} size={15} />
              </button>
            );
          })}
        </div>

        <div className="border-t border-line pt-2">
          <button type="button" onClick={onNewNote} className={cn(itemClasses, 'text-ink hover:bg-muted focus-visible:bg-muted')}>
            <Plus size={15} className="text-ink-muted" />
            {t('newNote')}
          </button>
          <button type="button" onClick={onRename} className={cn(itemClasses, 'text-ink hover:bg-muted focus-visible:bg-muted')}>
            <Pencil size={15} className="text-ink-muted" />
            {t('rename')}
          </button>
          <button type="button" onClick={onDelete} className={cn(itemClasses, 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft')}>
            <Trash2 size={15} />
            {t('delete')}
          </button>
        </div>
      </div>
    </>
  );
}
