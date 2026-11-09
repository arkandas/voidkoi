'use client';

import { Bold, Code2, Heading2, ImagePlus, Italic, Link2, List, Quote, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ChangeEvent, type ClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent,
} from 'react';

import { useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useApiError } from '@/lib/use-api-error';
import { lineHeightFor } from '@/modules/notes/lib/fonts';
import { applyEdit, wrapSelection, type Wrap } from '@/modules/notes/lib/formatting';
import { imageMarkdown, uploadNoteImage } from '@/modules/notes/lib/image-upload';

type Action = 'bold' | 'italic' | 'code' | 'link' | 'heading' | 'list' | 'quote';

const TOOLBAR: { icon: LucideIcon; action: Action; shortcut?: string; wrap: Wrap }[] = [
  { icon: Bold, action: 'bold', shortcut: '⌘B', wrap: { kind: 'inline', before: '**', after: '**' } },
  { icon: Italic, action: 'italic', shortcut: '⌘I', wrap: { kind: 'inline', before: '_', after: '_' } },
  { icon: Code2, action: 'code', wrap: { kind: 'inline', before: '`', after: '`' } },
  { icon: Link2, action: 'link', shortcut: '⌘K', wrap: { kind: 'inline', before: '[', after: '](url)' } },
  { icon: Heading2, action: 'heading', wrap: { kind: 'heading' } },
  { icon: List, action: 'list', wrap: { kind: 'prefix', marker: '- ' } },
  { icon: Quote, action: 'quote', wrap: { kind: 'prefix', marker: '> ' } },
];

const SHORTCUTS: Record<string, Wrap> = { b: TOOLBAR[0].wrap, i: TOOLBAR[1].wrap, k: TOOLBAR[3].wrap };

const PADDING_TOP = 20;
/** Lines kept in view below the cursor while typing at the bottom. */
const CURSOR_MARGIN_LINES = 4;

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/**
 * The Markdown source: a formatting toolbar, line numbers, and a plain text
 * area. Pictures pasted, dropped or picked are uploaded and put in where the
 * cursor is.
 */
export function NoteEditor({
  value,
  onChange,
  onSave,
  size,
  narrow,
  className,
}: {
  value: string;
  onChange(value: string): void;
  /** ⌘S. */
  onSave(): void;
  /** The text size picked in Settings. */
  size: number;
  narrow: boolean;
  className?: string;
}) {
  const t = useTranslations('notes.editor');
  const toast = useToast();
  const apiError = useApiError();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  /** How tall each line is once wrapped, as the mirror measures it. */
  const rowHeightsRef = useRef<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragDepth, setDragDepth] = useState(0);
  const [dragCount, setDragCount] = useState(0);

  // At least 16px on a phone, so iOS doesn't zoom in on the text.
  const fontSize = narrow ? Math.max(16, size) : size;
  const lineHeight = lineHeightFor(fontSize);
  const numberSize = Math.round(fontSize * 0.8);
  const lines = useMemo(() => value.split('\n'), [value]);
  const gutterWidth = Math.round(Math.max(2, String(lines.length).length) * numberSize * 0.6) + 18;

  /**
   * Each line's height in a hidden copy of the text as wide as the text area, so a wrapped line's number stays level
   * with it. The copy never transitions, so it is at its new width when read.
   */
  const measure = useCallback(() => {
    const mirror = mirrorRef.current;
    const textarea = textareaRef.current;
    if (!mirror || !textarea) return;
    mirror.style.width = `${textarea.clientWidth}px`;
    const heights = Array.from(mirror.children, row => (row as HTMLElement).offsetHeight);
    rowHeightsRef.current = heights;
    setRowHeights(current => (current.length === heights.length && current.every((height, index) => height === heights[index]) ? current : heights));
  }, []);

  useLayoutEffect(() => measure(), [measure, lines, fontSize, lineHeight]);

  // Wrapping changes with the width, and when a font arrives after the first measure.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(textarea);
    document.fonts.addEventListener('loadingdone', measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [measure]);

  // A selection set before React put the new text in.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const selection = pendingSelection.current;
    if (!textarea || !selection) return;
    pendingSelection.current = null;
    textarea.setSelectionRange(selection.start, selection.end);
    textarea.focus();
  });

  const keepCursorInView = useCallback(() => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const line = textarea.value.substring(0, textarea.selectionEnd).split('\n').length - 1;
      let bottom = PADDING_TOP;
      for (let index = 0; index <= line; index++) bottom += rowHeightsRef.current[index] ?? lineHeight;
      const wanted = bottom + CURSOR_MARGIN_LINES * lineHeight - textarea.clientHeight;
      if (wanted > textarea.scrollTop) {
        textarea.scrollTop = wanted;
        if (gutterRef.current) gutterRef.current.scrollTop = wanted;
      }
    });
  }, [lineHeight]);

  /** Through the browser's own editing where it can, so ⌘Z undoes it. */
  const replaceRange = useCallback(
    (from: number, to: number, text: string, selStart: number, selEnd: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(from, to);
      let applied = false;
      try {
        applied = document.execCommand('insertText', false, text);
      } catch {}
      if (applied) {
        textarea.setSelectionRange(selStart, selEnd);
        return;
      }
      pendingSelection.current = { start: selStart, end: selEnd };
      onChange(applyEdit(textarea.value, { from, to, text, selStart, selEnd }));
    },
    [onChange],
  );

  const format = useCallback(
    (wrap: Wrap) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const edit = wrapSelection(textarea.value, textarea.selectionStart, textarea.selectionEnd, wrap);
      replaceRange(edit.from, edit.to, edit.text, edit.selStart, edit.selEnd);
    },
    [replaceRange],
  );

  const insertImages = useCallback(
    async (files: File[]) => {
      const images = files.filter(file => file.type.startsWith('image/'));
      if (images.length === 0) return;
      setUploading(count => count + images.length);
      for (const file of images) {
        try {
          const image = await uploadNoteImage(file);
          const textarea = textareaRef.current;
          const at = textarea ? textarea.selectionStart : 0;
          const text = `\n\n${imageMarkdown(file, image)}\n\n`;
          replaceRange(at, textarea ? textarea.selectionEnd : at, text, at + text.length, at + text.length);
        } catch (error) {
          toast.show(apiError(error, 'uploadFailed'), 'error');
        } finally {
          setUploading(count => count - 1);
        }
      }
    },
    [replaceRange, toast, apiError],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      const wrap = SHORTCUTS[key];
      if (wrap && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        format(wrap);
        return;
      }
      if (key === 's') {
        event.preventDefault();
        onSave();
        return;
      }
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const at = textarea.selectionStart;
      replaceRange(at, textarea.selectionEnd, '  ', at + 2, at + 2);
      return;
    }
    keepCursorInView();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(event.clipboardData.files);
    if (files.some(file => file.type.startsWith('image/'))) {
      event.preventDefault();
      void insertImages(files);
    }
  };

  // The drop highlight goes when a drag ends anywhere, even outside the editor.
  useEffect(() => {
    if (dragDepth === 0) return;
    const reset = (): void => setDragDepth(0);
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, [dragDepth]);

  return (
    <div
      className={cn('relative flex min-w-0 flex-col', className)}
      onDragEnter={event => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragCount(Array.from(event.dataTransfer.items).filter(item => item.kind === 'file').length);
        setDragDepth(depth => depth + 1);
      }}
      onDragLeave={event => {
        if (carriesFiles(event)) setDragDepth(depth => Math.max(0, depth - 1));
      }}
      onDragOver={event => {
        if (carriesFiles(event)) event.preventDefault();
      }}
      onDrop={event => {
        setDragDepth(0);
        const files = Array.from(event.dataTransfer.files);
        if (files.some(file => file.type.startsWith('image/'))) {
          event.preventDefault();
          void insertImages(files);
        }
      }}
    >
      <div
        role="toolbar"
        aria-label={t('formatting')}
        className="scrollbar-hidden flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface pr-2 pl-2 sm:pl-(--gutter)"
        style={{ '--gutter': `${gutterWidth}px` } as CSSProperties}
      >
        {TOOLBAR.map(({ icon: Icon, action, shortcut, wrap }, index) => {
          const label = t(`toolbar.${action}`);
          return (
            <Fragment key={action}>
              {index === 4 ? <span className="mx-1.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" /> : null}
              <button
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => format(wrap)}
                title={shortcut ? `${label} (${shortcut})` : label}
                aria-label={label}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Icon size={15} />
              </button>
            </Fragment>
          );
        })}

        <span className="mx-1.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        <button
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          title={t('insertImageHint')}
          aria-label={t('insertImage')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ImagePlus size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            void insertImages(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        {uploading > 0 ? (
          <span role="status" className="ml-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-muted">
            <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
            {uploading === 1 ? t('uploading') : t('uploadingCount', { count: uploading })}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="hidden shrink-0 overflow-hidden border-r border-line bg-surface pr-2 text-right text-ink-faint select-none sm:block"
          style={{ width: `${gutterWidth}px`, fontFamily: 'var(--notes-code-font)', fontSize: `${numberSize}px`, paddingTop: `${PADDING_TOP}px` }}
        >
          {lines.map((_, index) => (
            <div key={index} style={{ height: `${rowHeights[index] ?? lineHeight}px`, lineHeight: `${lineHeight}px` }}>
              {index + 1}
            </div>
          ))}
          <div style={{ height: '84px' }} />
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          aria-label={t('source')}
          onChange={event => {
            onChange(event.target.value);
            keepCursorInView();
          }}
          onScroll={() => {
            if (gutterRef.current && textareaRef.current) gutterRef.current.scrollTop = textareaRef.current.scrollTop;
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={t('placeholder')}
          spellCheck={false}
          className="themed-scroll min-w-0 flex-1 resize-none border-none bg-raised break-words whitespace-pre-wrap text-ink outline-hidden placeholder:text-ink-faint"
          style={{
            fontFamily: 'var(--notes-text-font)',
            fontSize: `${fontSize}px`,
            lineHeight: `${lineHeight}px`,
            padding: `${PADDING_TOP}px 24px 84px 16px`,
          }}
        />
      </div>

      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="invisible absolute top-0 left-0 h-0 overflow-hidden break-words whitespace-pre-wrap transition-none *:transition-none"
        style={{ fontFamily: 'var(--notes-text-font)', fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, padding: '0 24px 0 16px' }}
      >
        {lines.map((line, index) => (
          <div key={index}>{line || '\u200b'}</div>
        ))}
      </div>

      {dragDepth > 0 ? (
        <div className="notes-drop pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <span className="flex items-center gap-2.5 rounded-xl border border-accent bg-raised px-4 py-3 text-[15px] font-semibold text-accent shadow-lg dark:bg-card">
            <ImagePlus size={18} />
            {dragCount > 1 ? t('dropImages', { count: dragCount }) : t('dropImage')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
