'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Edit2, Palette, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { Markdown } from '@/modules/tasks/components/markdown';
import type { StickyInput } from '@/modules/tasks/lib/api';
import type { StickyColor, StickyNoteDto } from '@/modules/tasks/lib/api-types';
import { STICKY_COLORS, stickyColorClass } from '@/modules/tasks/lib/sticky-colors';

interface StickyNoteProps {
  note: StickyNoteDto;
  /** Saves changes; with none, brings the note to the front. */
  onUpdate(id: number, changes: StickyInput): Promise<void>;
  onDelete(id: number): void;
  highlighted?: boolean;
}

const MENU_BUTTON = 'flex size-8 items-center justify-center rounded-md transition-colors';

/** A note on the board: dragged anywhere, its colour, text and place kept. Its tools show on hover. */
export function StickyNote({ note, onUpdate, onDelete, highlighted = false }: StickyNoteProps) {
  const t = useTranslations('tasks.stickyNotes');
  const tColors = useTranslations('tasks.colors');
  const tCommon = useTranslations('common');
  const tDrag = useTranslations('tasks.dragAndDrop');
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [picking, setPicking] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: note.id,
    data: { type: 'stickynote', note },
    disabled: editing,
    attributes: { roleDescription: tDrag('sortable') },
  });

  const save = async (): Promise<void> => {
    try {
      await onUpdate(note.id, { content });
      setEditing(false);
    } catch {
      // The board says what went wrong; the text stays to try again.
    }
  };

  const cancel = (): void => {
    setContent(note.content);
    setEditing(false);
  };

  const recolor = async (color: StickyColor): Promise<void> => {
    try {
      await onUpdate(note.id, { color });
      setPicking(false);
    } catch {
      // As above.
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
        position: 'absolute',
        left: `min(${note.x}px, calc(100% - ${note.width}px - 20px))`,
        top: note.y,
        width: `min(${note.width}px, calc(100% - 40px))`,
        height: note.height,
        zIndex: isDragging || picking || highlighted ? 1000 : note.z,
      }}
      {...attributes}
      {...listeners}
      className={cn(
        stickyColorClass(note.color),
        'group cursor-grab rounded-lg border-2 p-3 shadow-lg transition-shadow duration-200 hover:shadow-xl active:cursor-grabbing',
        highlighted && 'search-hit',
      )}
    >
      <div
        className={cn(
          'sticky-menu absolute -top-4 -right-2 flex gap-0.5 rounded-lg border p-1 shadow-lg transition-opacity duration-200',
          'group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
          picking ? 'opacity-100' : 'opacity-0',
        )}
        onPointerDown={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            setPicking(!picking);
          }}
          className={MENU_BUTTON}
          title={t('changeColor')}
          aria-label={t('changeColor')}
          aria-expanded={picking}
        >
          <Palette size={16} />
        </button>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            void onUpdate(note.id, {}).catch(() => {});
            setEditing(true);
          }}
          className={MENU_BUTTON}
          title={t('edit')}
          aria-label={t('edit')}
        >
          <Edit2 size={16} />
        </button>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onDelete(note.id);
          }}
          className={cn(MENU_BUTTON, 'is-danger')}
          title={t('delete')}
          aria-label={t('delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {picking ? (
        <div className="sticky-menu absolute top-8 right-0 z-50 rounded-xl border p-2.5 shadow-xl" onPointerDown={event => event.stopPropagation()}>
          <div className="grid w-max grid-cols-3 gap-2">
            {STICKY_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => void recolor(color)}
                className={cn(
                  `sticky-${color} sticky-swatch size-8 rounded-md border-2 transition-transform duration-200 hover:scale-110`,
                  color === note.color && 'ring-2 ring-[#1f2937] ring-offset-2 ring-offset-white',
                )}
                title={tColors(color)}
                aria-label={tColors(color)}
                aria-pressed={color === note.color}
              />
            ))}
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="flex h-full flex-col" onPointerDown={event => event.stopPropagation()}>
          <textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            className="h-full w-full flex-1 resize-none overflow-y-auto border-none p-0 text-sm outline-hidden [overflow-wrap:anywhere]"
            placeholder={t('placeholder')}
            aria-label={t('textLabel')}
            maxLength={500}
            autoFocus
          />
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={() => void save()} className="sticky-save">
              {tCommon('save')}
            </button>
            <button type="button" onClick={cancel} className="sticky-cancel">
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="themed-scroll h-full overflow-y-auto text-sm" onClick={event => event.stopPropagation()}>
          {note.content ? <Markdown>{note.content}</Markdown> : <span className="sticky-muted">{t('placeholder')}</span>}
        </div>
      )}
    </div>
  );
}

/** A note as it looks while it is dragged, under the pointer. */
export function StickyNotePreview({ note }: { note: StickyNoteDto }) {
  const t = useTranslations('tasks.stickyNotes');
  return (
    <div
      className={cn(stickyColorClass(note.color), 'scale-105 rotate-2 rounded-lg border-2 p-3 opacity-95 shadow-2xl')}
      style={{ width: note.width, height: note.height }}
    >
      <div className="h-full overflow-hidden text-sm">
        {note.content ? <Markdown>{note.content}</Markdown> : <span className="sticky-muted">{t('placeholder')}</span>}
      </div>
    </div>
  );
}
