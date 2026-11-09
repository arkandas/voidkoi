'use client';

import { Check, Columns2, Eye, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';

import { Markdown } from '@/modules/files/components/markdown';
import { Segmented, Spinner } from '@/components/ui';
import { api } from '@/modules/files/lib/api';
import type { ItemDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/error-codes';
import { EDIT_LIMIT, isMarkdown } from '@/lib/file-types';
import { useApiError } from '@/lib/use-api-error';
import { useStoredState } from '@/lib/use-stored-state';

/** A file too big to edit shows this much: enough for any note or log someone wants to glance at. */
const VIEW_LIMIT = 512 * 1024;

/** A pause in typing this long saves. */
const SAVE_DELAY_MS = 800;

const MODES = ['editor', 'split', 'preview'] as const;
type Mode = (typeof MODES)[number];

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** What the viewer asks of an open editor before leaving it: save what is left. */
export interface Saver {
  /** False when it couldn't be saved, so the editor should stay open. */
  flush(): Promise<boolean>;
}

interface Loaded {
  text: string;
  /** Only the start of a big file was read. */
  cut: boolean;
  /** Read whole, as valid UTF-8, and small enough: can be edited. */
  editable: boolean;
  version: string | null;
  /** Written back the way it came: with Windows line ends, with a byte order mark. */
  crlf: boolean;
  bom: boolean;
}

async function load(url: string, size: number): Promise<Loaded> {
  const whole = size <= EDIT_LIMIT;
  const response = await fetch(url, { cache: 'no-store', ...(whole ? {} : { headers: { Range: `bytes=0-${VIEW_LIMIT - 1}` } }) });
  if (!response.ok) throw new Error(String(response.status));
  const total = Number(response.headers.get('content-range')?.split('/')[1] ?? size);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text: string;
  let valid = true;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    valid = false;
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return {
    text: text.replace(/\r\n/g, '\n'),
    cut: !whole && total > VIEW_LIMIT,
    editable: whole && valid,
    version: response.headers.get('etag'),
    crlf: text.includes('\r\n'),
    bom,
  };
}

/**
 * A text file in the viewer: Markdown formatted, anything else as it is. In
 * edit mode, an editor that saves on its own while typing pauses; Markdown
 * gets its formatted preview beside it, like in Notes.
 */
export function TextFile({
  item,
  url,
  editing,
  onEditable,
  onSaved,
  saver,
}: {
  item: ItemDto;
  url: string;
  editing: boolean;
  /** Whether this file can be edited, once it has loaded. */
  onEditable?(editable: boolean): void;
  onSaved?(item: ItemDto): void;
  saver?: Ref<Saver>;
}) {
  const t = useTranslations('files.viewer');
  const apiError = useApiError();
  const markdown = isMarkdown(item.mime, item.name);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  /** What is written on the server, shown once editing ends. */
  const [savedText, setSavedText] = useState('');
  const [state, setState] = useState<SaveState>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const [mode, setMode] = useStoredState<Mode>('files-edit-mode', 'split', MODES);

  // Saving works from refs: it runs from timers, after awaits, and on the way out.
  const draftRef = useRef('');
  const savedRef = useRef('');
  const versionRef = useRef<string | null>(null);
  const formatRef = useRef({ crlf: false, bom: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onEditableRef = useRef(onEditable);
  const saveRef = useRef<(force?: boolean) => Promise<boolean>>(() => Promise.resolve(true));

  useEffect(() => {
    onSavedRef.current = onSaved;
    onEditableRef.current = onEditable;
  }, [onSaved, onEditable]);

  /** The file as the server has it, read again only for a different file or address: a save changes the size. */
  const read = useCallback(
    () => load(url, item.size),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, item.id],
  );

  const show = useCallback((file: Loaded) => {
    setLoaded(file);
    setDraft(file.text);
    setSavedText(file.text);
    draftRef.current = file.text;
    savedRef.current = file.text;
    versionRef.current = file.version;
    formatRef.current = { crlf: file.crlf, bom: file.bom };
    setState('saved');
    setProblem(null);
    onEditableRef.current?.(file.editable);
  }, []);

  const fail = useCallback(() => {
    setFailed(true);
    onEditableRef.current?.(false);
  }, []);

  const reload = useCallback(async () => {
    setFailed(false);
    try {
      show(await read());
    } catch {
      fail();
    }
  }, [read, show, fail]);

  // The first read. The file is shown once it is here, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    read().then(
      file => {
        if (!cancelled) show(file);
      },
      () => {
        if (!cancelled) fail();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [read, show, fail]);

  const save = useCallback(
    async (force = false): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (inflight.current) await inflight.current;
      const value = draftRef.current;
      if (value === savedRef.current && !force) {
        setState('saved');
        return true;
      }
      const body = (formatRef.current.bom ? '﻿' : '') + (formatRef.current.crlf ? value.replace(/\n/g, '\r\n') : value);
      if (new Blob([body]).size > EDIT_LIMIT) {
        setState('error');
        setProblem(apiError(new ApiError('fileTooLarge', 413), 'saveFailed'));
        return false;
      }
      setState('saving');
      const run = (async () => {
        try {
          const { item: stored, version } = await api.saveText(item.id, body, force ? null : versionRef.current);
          versionRef.current = version;
          savedRef.current = value;
          setSavedText(value);
          setProblem(null);
          onSavedRef.current?.(stored);
          if (draftRef.current === value) setState('saved');
          else timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
          return true;
        } catch (error) {
          const conflict = error instanceof ApiError && error.code === 'editConflict';
          setState(conflict ? 'conflict' : 'error');
          setProblem(conflict ? null : apiError(error, 'saveFailed'));
          return false;
        }
      })();
      inflight.current = run;
      try {
        return await run;
      } finally {
        inflight.current = null;
      }
    },
    [item.id, apiError],
  );

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useImperativeHandle(saver, () => ({ flush: () => save() }), [save]);

  // Leaving with changes not saved yet asks first.
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent): void => {
      if (draftRef.current === savedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
    draftRef.current = event.target.value;
    if (state !== 'conflict') {
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
    }
  };

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
      return;
    }
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const area = event.currentTarget;
      const { selectionStart: start, selectionEnd: end, value } = area;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      area.value = next;
      area.setSelectionRange(start + 2, start + 2);
      change({ target: area } as ChangeEvent<HTMLTextAreaElement>);
    }
  };

  if (failed) return <p className="text-sm text-stage-ink-muted">{t('failed')}</p>;
  if (!loaded) return <Spinner className="text-stage-ink-muted" />;

  const panel = 'flex size-full flex-col overflow-hidden rounded-xl bg-raised text-ink shadow-2xl';

  if (!editing) {
    return (
      <div className={cn(panel, markdown ? 'max-w-3xl' : 'max-w-5xl')}>
        <div className="themed-scroll min-h-0 flex-1 overflow-auto">
          {markdown ? (
            <Markdown text={savedText} className="px-6 py-6 sm:px-10 sm:py-8" />
          ) : (
            <pre className="p-5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">{savedText}</pre>
          )}
        </div>
        {loaded.cut ? <p className="border-t border-line px-5 py-2 text-xs text-ink-muted">{t('textCut')}</p> : null}
      </div>
    );
  }

  const showEditor = !markdown || mode !== 'preview';
  const showPreview = markdown && mode !== 'editor';

  return (
    <div className={cn(panel, 'max-w-6xl')}>
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        {markdown ? (
          <Segmented<Mode>
            ariaLabel={t('mode.label')}
            iconOnly
            value={mode}
            onChange={setMode}
            options={[
              { value: 'editor', label: t('mode.editor'), icon: PenLine },
              { value: 'split', label: t('mode.split'), icon: Columns2 },
              { value: 'preview', label: t('mode.preview'), icon: Eye },
            ]}
          />
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2 text-sm" role="status" aria-live="polite">
          {state === 'saved' ? (
            <span className="flex items-center gap-1.5 text-ink-muted">
              <Check size={14} aria-hidden="true" />
              {t('saved')}
            </span>
          ) : state === 'saving' ? (
            <span className="text-ink-muted">{t('saving')}</span>
          ) : state === 'error' ? (
            <>
              <span className="truncate font-medium text-danger">{problem ?? t('notSaved')}</span>
              <button type="button" onClick={() => void save()} className="shrink-0 rounded-md px-2 py-1 font-semibold text-accent hover:bg-accent-soft">
                {t('retry')}
              </button>
            </>
          ) : (
            <>
              <span className="truncate font-medium text-danger">{t('conflict')}</span>
              <button type="button" onClick={() => void reload()} className="shrink-0 rounded-md px-2 py-1 font-semibold text-ink hover:bg-muted">
                {t('reload')}
              </button>
              <button type="button" onClick={() => void save(true)} className="shrink-0 rounded-md px-2 py-1 font-semibold text-accent hover:bg-accent-soft">
                {t('keepMine')}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {showEditor ? (
          <textarea
            value={draft}
            onChange={change}
            onKeyDown={keys}
            aria-label={t('editLabel', { name: item.name })}
            spellCheck={false}
            autoFocus
            className={cn(
              'themed-scroll min-w-0 flex-1 resize-none border-none bg-raised p-5 font-mono text-[13.5px] leading-relaxed text-ink outline-hidden',
              showPreview && 'md:w-1/2 md:flex-none',
            )}
          />
        ) : null}
        {showPreview ? (
          <div
            className={cn(
              'themed-scroll min-w-0 flex-1 overflow-auto',
              showEditor ? 'hidden border-l border-line md:block md:w-1/2 md:flex-none' : '',
            )}
          >
            <Markdown text={draft} className="px-6 py-5 sm:px-8" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
