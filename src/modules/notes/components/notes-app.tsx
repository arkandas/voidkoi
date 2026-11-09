'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { Check, Code, Columns2, Download, Eye, FileDown, FileText, FileType, Menu, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';

import { useMe } from '@/components/me';
import { AppSwitcher } from '@/components/shell/switcher';
import { ActionMenu, Button, EmptyState, IconButton, Segmented, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';
import { notesApi } from '@/modules/notes/lib/api';
import type { FolderChanges, NoteDto, NoteFolderDto } from '@/modules/notes/lib/api-types';
import { Autosaver, type SaveState } from '@/modules/notes/lib/autosave';
import { exportDocx, exportMarkdown } from '@/modules/notes/lib/export';
import { sortFolders } from '@/modules/notes/lib/folders';
import { DEFAULT_NOTE_SETTINGS, fontFamilies, fontVariables, lineHeightFor, type NoteSettings } from '@/modules/notes/lib/fonts';

import { MarkdownView } from './markdown-view';
import { NoteEditor } from './note-editor';
import { NotesSidebar } from './notes-sidebar';
import { SidePane } from './side-pane';

type View = 'editor' | 'split' | 'preview';

const NARROW = '(max-width: 767px)';

function subscribeNarrow(callback: () => void): () => void {
  const media = window.matchMedia(NARROW);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/** A phone: the list is a drawer and there's no room for two panes side by side. */
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

function readIds(key: string): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

/**
 * Notes: folders of Markdown notes down the side, and the note being written
 * with its preview. Another note can be locked on the left to read from until
 * its pane is closed. Typing saves itself.
 */
export function NotesApp() {
  const t = useTranslations('notes');
  const locale = useLocale();
  const me = useMe();
  const toast = useToast();
  const apiError = useApiError();
  const narrow = useNarrow();
  const openKey = `voidkoi-notes-open:${me.id}`;
  const sideKey = `voidkoi-notes-side:${me.id}`;

  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [folders, setFolders] = useState<NoteFolderDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [sideId, setSideId] = useState<number | null>(null);
  const [sideShow, setSideShow] = useState<'source' | 'preview'>('preview');
  const [view, setView] = useState<View>('split');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [settings, setSettings] = useState<NoteSettings>(DEFAULT_NOTE_SETTINGS);
  const restored = useRef(false);

  // One for as long as the page is open. The language can't change while it is.
  const [saver] = useState(
    () =>
      new Autosaver<NoteDto>({
        send: (id, draft) => notesApi.update(id, draft),
        saved: (_id, note) => setNotes(current => current.map(entry => (entry.id === note.id ? note : entry))),
        lost: (_id, error) => toast.show(apiError(error, 'saveFailed'), 'error'),
        isGone: error => error instanceof ApiError && error.status === 404,
        state: setSaveState,
      }),
  );

  useEffect(() => {
    let active = true;
    // Without its fonts the app still works, in the default ones.
    Promise.all([notesApi.list(), notesApi.folders(), notesApi.settings().catch(() => DEFAULT_NOTE_SETTINGS)])
      .then(([list, folderList, chosen]) => {
        if (!active) return;
        setNotes(list);
        setSettings(chosen);
        setFolders(sortFolders(folderList));
        const side = readIds(sideKey)[0];
        if (list.some(note => note.id === side)) setSideId(side);
        const last = list.find(note => note.id === readIds(openKey)[0] && note.id !== side);
        if (last) {
          setSelectedId(last.id);
          setTitle(last.title);
          setContent(last.content);
        }
        restored.current = true;
      })
      .catch(error => {
        if (active) toast.show(apiError(error, 'loadFailed'), 'error');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
    // Once: the account doesn't change under the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restored.current) store(openKey, selectedId === null ? null : JSON.stringify([selectedId]));
  }, [selectedId, openKey]);

  useEffect(() => {
    if (restored.current) store(sideKey, sideId === null ? null : JSON.stringify([sideId]));
  }, [sideId, sideKey]);

  // What isn't saved yet goes before leaving: for another app, another tab, or the browser.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (saver.pending) event.preventDefault();
    };
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') saver.flush();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', hidden);
      saver.flush();
    };
  }, [saver]);

  useEffect(() => {
    const before = (): void => flushSync(() => setPrinting(true));
    const after = (): void => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const formatDate = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    [locale],
  );

  const fail = (error: unknown, fallback: Parameters<typeof apiError>[1]): void => toast.show(apiError(error, fallback), 'error');

  /** Put a note in the editor, with whatever of it isn't saved yet. */
  const show = (note: NoteDto | null): void => {
    const draft = note ? saver.draft(note.id) : undefined;
    setSelectedId(note?.id ?? null);
    setTitle(draft?.title ?? note?.title ?? '');
    setContent(draft?.content ?? note?.content ?? '');
    setConfirmDelete(false);
  };

  const open = (note: NoteDto): void => {
    saver.flush();
    // Only where there is no left pane, on a phone, can the note kept there be picked: it leaves it.
    if (note.id === sideId) setSideId(null);
    show(note);
    setDrawerOpen(false);
  };

  const changeTitle = (value: string): void => {
    setTitle(value);
    if (selectedId !== null) saver.change(selectedId, { title: value, content });
  };

  const changeContent = (value: string): void => {
    setContent(value);
    if (selectedId !== null) saver.change(selectedId, { title, content: value });
  };

  const createNote = async (folder: string): Promise<void> => {
    saver.flush();
    try {
      const note = await notesApi.create({ title: t('untitled'), folder });
      setNotes(current => [...current, note]);
      open(note);
    } catch (error) {
      fail(error, 'saveFailed');
    }
  };

  /** Gone from the list at once. Should the server say no, the list is read again. */
  const trashNote = async (id: number): Promise<void> => {
    setConfirmDelete(false);
    saver.flush();
    setNotes(current => current.filter(note => note.id !== id));
    setSideId(current => (current === id ? null : current));
    if (id === selectedId) show(null);
    try {
      await notesApi.trash(id);
    } catch (error) {
      fail(error, 'deleteFailed');
      notesApi.list().then(setNotes, () => {});
    }
  };

  const createFolder = async (name: string): Promise<boolean> => {
    if (folders.some(folder => folder.name === name)) {
      toast.show(t('list.folderExists', { name }), 'error');
      return false;
    }
    try {
      const folder = await notesApi.createFolder(name);
      setFolders(current => sortFolders([...current, folder]));
      return true;
    } catch (error) {
      fail(error, 'saveFailed');
      return false;
    }
  };

  const changeFolder = async (folder: NoteFolderDto, changes: FolderChanges): Promise<void> => {
    setFolders(current => current.map(entry => (entry.id === folder.id ? { ...entry, ...changes } : entry)));
    try {
      await notesApi.updateFolder(folder.id, changes);
    } catch (error) {
      setFolders(current => current.map(entry => (entry.id === folder.id ? folder : entry)));
      fail(error, 'saveFailed');
    }
  };

  const renameFolder = async (folder: NoteFolderDto, name: string): Promise<void> => {
    if (folders.some(entry => entry.id !== folder.id && entry.name === name)) {
      toast.show(t('list.folderExists', { name }), 'error');
      return;
    }
    const rename = (from: string, to: string): void => {
      setFolders(current => sortFolders(current.map(entry => (entry.id === folder.id ? { ...entry, name: to } : entry))));
      setNotes(current => current.map(note => (note.folder === from ? { ...note, folder: to } : note)));
    };
    rename(folder.name, name);
    try {
      await notesApi.updateFolder(folder.id, { name });
    } catch (error) {
      rename(name, folder.name);
      fail(error, 'saveFailed');
    }
  };

  const deleteFolder = async (folder: NoteFolderDto): Promise<void> => {
    try {
      await notesApi.deleteFolder(folder.id);
      setFolders(current => current.filter(entry => entry.id !== folder.id));
      setNotes(current => current.map(note => (note.folder === folder.name ? { ...note, folder: '' } : note)));
    } catch (error) {
      fail(error, 'deleteFailed');
    }
  };

  const reorder = async (note: NoteDto, over: NoteDto): Promise<void> => {
    const group = notes.filter(entry => entry.folder === note.folder).sort((a, b) => a.position - b.position);
    const from = group.findIndex(entry => entry.id === note.id);
    const to = group.findIndex(entry => entry.id === over.id);
    if (from === -1 || to === -1 || from === to) return;
    const places = new Map(arrayMove(group, from, to).map((entry, position) => [entry.id, position]));
    const before = new Map(group.map(entry => [entry.id, entry.position]));
    const place = (positions: Map<number, number>): void =>
      setNotes(current => current.map(entry => (positions.has(entry.id) ? { ...entry, position: positions.get(entry.id)! } : entry)));
    place(places);
    try {
      await notesApi.reorder([...places].map(([id, position]) => ({ id, position })));
    } catch (error) {
      place(before);
      fail(error, 'saveFailed');
    }
  };

  const move = async (note: NoteDto, folder: string): Promise<void> => {
    setNotes(current => current.map(entry => (entry.id === note.id ? { ...entry, folder, position: Number.MAX_SAFE_INTEGER } : entry)));
    try {
      const moved = await notesApi.update(note.id, { folder });
      setNotes(current => current.map(entry => (entry.id === moved.id ? moved : entry)));
    } catch (error) {
      setNotes(current => current.map(entry => (entry.id === note.id ? { ...entry, folder: note.folder, position: note.position } : entry)));
      fail(error, 'saveFailed');
    }
  };

  /** Lock a note on the left until its pane is closed. The note being written goes there, and the editor lets go of it. */
  const pin = (note: NoteDto): void => {
    if (note.id === selectedId) {
      saver.flush();
      show(null);
    }
    setSideId(note.id);
  };

  const exportNote = (kind: 'markdown' | 'pdf' | 'word'): void => {
    if (kind === 'markdown') exportMarkdown(title, content);
    else if (kind === 'word') exportDocx(title, content).catch(() => toast.show(t('editor.exportFailed'), 'error'));
    else {
      setPrinting(true);
      setTimeout(() => window.print(), 50);
    }
  };

  const sideNote = sideId === null ? null : notes.find(note => note.id === sideId) ?? null;
  const sideOpen = sideNote !== null && !narrow;
  const shown: View = (narrow || sideOpen) && view === 'split' ? 'editor' : view;
  const preview = useDeferredValue(content);
  const words = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);
  const previewPadding = shown === 'preview' ? 'mx-auto max-w-3xl px-5 py-6 sm:px-10 sm:py-8' : 'px-6 py-5';

  return (
    <div className="flex min-w-0 flex-1" style={fontVariables(settings)}>
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={cn('fixed inset-0 z-40 bg-scrim transition-opacity duration-300 md:hidden', drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <aside
        aria-label={t('list.label')}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[84%] max-w-[320px] flex-col bg-surface pb-safe shadow-2xl transition-[transform,visibility] duration-300 ease-out',
          drawerOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
          'md:visible md:static md:z-auto md:w-56 md:max-w-none md:translate-x-0 md:bg-transparent md:pb-0 md:shadow-none md:transition-none',
        )}
      >
        <NotesSidebar
          loaded={loaded}
          notes={notes}
          folders={folders}
          selectedId={selectedId}
          pinnedId={sideOpen ? sideNote.id : null}
          canPin={!narrow && sideNote === null}
          formatDate={formatDate}
          onSelect={open}
          onPin={pin}
          onNewNote={folder => void createNote(folder)}
          onCreateFolder={createFolder}
          onFolderChange={(folder, changes) => void changeFolder(folder, changes)}
          onFolderRename={(folder, name) => void renameFolder(folder, name)}
          onFolderDelete={folder => void deleteFolder(folder)}
          onReorder={(note, over) => void reorder(note, over)}
          onMove={(note, folder) => void move(note, folder)}
          onRestored={note => setNotes(current => [...current, note])}
          onClose={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="flex min-w-0 flex-1">
        {/* The note on the left is a panel of its own, so the title and state of the one being written stay with it. */}
        {sideOpen ? (
          <SidePane
            title={sideNote.title || t('untitled')}
            content={sideNote.content}
            show={sideShow}
            onShow={setSideShow}
            onClose={() => setSideId(null)}
            fontSize={settings.fontSize}
            lineHeight={lineHeightFor(settings.fontSize)}
          />
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-[3] flex-col overflow-hidden bg-surface md:border-l md:border-line">
          <header className={cn('flex h-14 shrink-0 items-center gap-1 border-b border-line pt-px pr-2 pl-3 sm:gap-2 sm:pr-3 sm:pl-4', selectedId === null && 'md:hidden')}>
            {/* From a tablet up, the list's column has the switcher. */}
            <AppSwitcher className="mr-1 md:hidden" />
            <IconButton label={t('list.show')} icon={<Menu size={20} />} onClick={() => setDrawerOpen(true)} className="md:hidden" />
            {selectedId !== null ? (
              <>
                <input
                  value={title}
                  onChange={event => changeTitle(event.target.value)}
                  placeholder={t('editor.titlePlaceholder')}
                  aria-label={t('editor.title')}
                  maxLength={500}
                  className="min-w-0 flex-1 border-none bg-transparent text-base font-bold text-ellipsis text-ink outline-hidden placeholder:text-ink-faint sm:text-[17px]"
                />
                <span role="status" aria-live="polite" className="hidden shrink-0 items-center gap-1.5 text-xs text-ink-faint sm:flex">
                  {saveState === 'error' ? (
                    <span className="flex items-center gap-1.5 font-medium text-danger">
                      <TriangleAlert size={12} aria-hidden="true" />
                      {t('editor.notSaved')}
                      <button
                        type="button"
                        onClick={() => saver.flush()}
                        className="rounded-sm px-1 py-0.5 text-[11px] font-semibold underline underline-offset-2 hover:bg-danger-soft"
                      >
                        {t('editor.retryNow')}
                      </button>
                    </span>
                  ) : saveState === 'saved' ? (
                    <>
                      <Check size={12} aria-hidden="true" />
                      {t('editor.saved')}
                    </>
                  ) : (
                    t('editor.saving')
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{t('editor.words', { words })}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1 sm:ml-1 sm:gap-1.5">
                  <Segmented<View>
                    ariaLabel={t('editor.view')}
                    iconOnly
                    value={shown}
                    onChange={setView}
                    options={[
                      { value: 'editor', label: t('editor.views.editor'), icon: Code },
                      ...(narrow || sideOpen ? [] : [{ value: 'split' as const, label: t('editor.views.split'), icon: Columns2 }]),
                      { value: 'preview', label: t('editor.views.preview'), icon: Eye },
                    ]}
                  />
                  <ActionMenu
                    label={t('editor.export')}
                    triggerClassName="size-9"
                    actions={[
                      { label: t('editor.exportMarkdown'), icon: FileText, onSelect: () => exportNote('markdown') },
                      { label: t('editor.exportPdf'), icon: FileDown, onSelect: () => exportNote('pdf') },
                      { label: t('editor.exportWord'), icon: FileType, onSelect: () => exportNote('word') },
                    ]}
                  >
                    <Download size={17} />
                  </ActionMenu>
                  {confirmDelete ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="destructive" onClick={() => void trashNote(selectedId)}>
                        {t('editor.deleteConfirm')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        {t('editor.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <IconButton
                      label={t('editor.delete')}
                      icon={<Trash2 size={17} />}
                      onClick={() => setConfirmDelete(true)}
                      className="size-9 hover:bg-danger-soft hover:text-danger"
                    />
                  )}
                </div>
              </>
            ) : (
              <span className="flex-1" />
            )}
          </header>

          {selectedId !== null ? (
            <>
              <div className="flex min-h-0 flex-1">
                {shown !== 'preview' ? (
                  <NoteEditor
                    key={selectedId}
                    value={content}
                    onChange={changeContent}
                    onSave={() => saver.flush()}
                    size={settings.fontSize}
                    narrow={narrow}
                    className={shown === 'editor' ? 'flex-1' : 'w-1/2 border-r border-line'}
                  />
                ) : null}

                {shown !== 'editor' ? (
                  <section aria-label={t('preview.title')} className={cn('flex min-w-0 flex-col', shown === 'preview' ? 'flex-1' : 'w-1/2')}>
                    <div className="flex h-10 shrink-0 items-center border-b border-line bg-surface px-4">
                      <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-faint uppercase">{t('preview.title')}</span>
                    </div>
                    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-raised">
                      {preview ? (
                        <div className={cn('markdown-body', previewPadding)}>
                          <MarkdownView text={preview} />
                        </div>
                      ) : (
                        <p className={cn('text-sm text-ink-faint italic', previewPadding)}>{t('preview.empty')}</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </div>

            </>
          ) : (
            // Where every app's empty page sits: under its header line, which this page hides on a wide screen.
            <div className="flex-1 lg:pt-14">
              <EmptyState
                className="py-20"
                icon={<FileText size={24} />}
                title={t('editor.noneSelected')}
                action={
                  <div className="flex items-center justify-center gap-2">
                    <Button icon={<Plus size={16} />} onClick={() => void createNote('')}>
                      {t('list.newNote')}
                    </Button>
                    <Button variant="outline" onClick={() => setDrawerOpen(true)} className="md:hidden">
                      {t('editor.browse')}
                    </Button>
                  </div>
                }
              />
            </div>
          )}
        </main>
      </div>

      {printing && selectedId !== null
        ? createPortal(
            <div data-app="notes" className="notes-print" style={fontFamilies(settings)}>
              <div className="markdown-body">
                <MarkdownView text={content} plain />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
