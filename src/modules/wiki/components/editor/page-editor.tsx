'use client';

import type { EditorView } from '@codemirror/view';
import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  Check,
  Code,
  Columns2,
  Eye,
  FileSymlink,
  Heading2,
  History,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  PenLine,
  Quote,
  RotateCcw,
  Send,
  Settings2,
  Share2,
  SquareCode,
  Strikethrough,
  Table,
  Trash,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';

import { AppSwitcher } from '@/components/shell/switcher';
import { MarkdownView } from '@/modules/wiki/components/markdown/markdown-view';
import { ActionMenu, Button, Confirm, Segmented, useToast, type MenuAction } from '@/components/ui';
import { Breadcrumbs } from '@/modules/wiki/components/page-header';
import { useWiki } from '@/modules/wiki/components/wiki-provider';
import { api, urls } from '@/modules/wiki/lib/api';
import type { DraftConflict, PageDetail } from '@/modules/wiki/lib/api-types';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/error-codes';
import { CALLOUTS, renderMarkdown, type Callout } from '@/modules/wiki/lib/markdown/render';
import { ancestorIds } from '@/modules/wiki/lib/tree-view';
import { useApiError } from '@/lib/use-api-error';
import { useStoredState } from '@/lib/use-stored-state';
import { LIMITS } from '@/modules/wiki/lib/validate';

import { MarkdownEditor } from './codemirror';
import { codeBlock, cycleHeading, insertBlock, insertImage, link, pageLink, run, table, toggleLinePrefix, toggleWrap } from './commands';
import { PagePicker } from './page-picker';
import { PublishDialog } from './publish-dialog';

/** A pause in typing this long saves the draft. */
const SAVE_DELAY_MS = 800;

const MODES = ['write', 'split', 'preview'] as const;
type Mode = (typeof MODES)[number];

type ToolId =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'pageLink'
  | 'bullets'
  | 'numbers'
  | 'tasks'
  | 'quote'
  | 'codeBlock'
  | 'table'
  | 'image'
  | 'rule';

/** The toolbar's buttons, in groups. */
const TOOLS: Array<Array<{ id: ToolId; icon: LucideIcon }>> = [
  [
    { id: 'heading', icon: Heading2 },
    { id: 'bold', icon: Bold },
    { id: 'italic', icon: Italic },
    { id: 'strikethrough', icon: Strikethrough },
    { id: 'code', icon: Code },
  ],
  [
    { id: 'link', icon: Link2 },
    { id: 'pageLink', icon: FileSymlink },
  ],
  [
    { id: 'bullets', icon: List },
    { id: 'numbers', icon: ListOrdered },
    { id: 'tasks', icon: ListChecks },
    { id: 'quote', icon: Quote },
  ],
  [
    { id: 'codeBlock', icon: SquareCode },
    { id: 'table', icon: Table },
    { id: 'image', icon: ImagePlus },
    { id: 'rule', icon: Minus },
  ],
];

type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

interface Text {
  title: string;
  content: string;
}

function startingText(detail: PageDetail): Text {
  if (detail.draft) return { title: detail.draft.title, content: detail.draft.content };
  if (detail.published) return { title: detail.published.title, content: detail.published.content };
  return { title: detail.title, content: '' };
}

/** Whether the window is too narrow for the editor and the preview side by side. */
function useNarrow(): boolean {
  return useSyncExternalStore(
    callback => {
      const media = window.matchMedia('(max-width: 899px)');
      media.addEventListener('change', callback);
      return () => media.removeEventListener('change', callback);
    },
    () => window.matchMedia('(max-width: 899px)').matches,
    () => false,
  );
}

/**
 * Writing a page: its title and Markdown, a preview beside them, the draft
 * saved on its own while typing pauses, and Publish to make it what readers see.
 */
export function PageEditor({ detail: initialDetail }: { detail: PageDetail }) {
  const t = useTranslations('wiki.editor');
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const { tree, refresh, open: openDialog } = useWiki();
  const narrow = useNarrow();

  const [detail, setDetail] = useState(initialDetail);
  const start = useMemo(() => startingText(initialDetail), [initialDetail]);
  const [title, setTitle] = useState(start.title);
  const [content, setContent] = useState(start.content);
  const [opening, setOpening] = useState(start.content);
  const [editorKey, setEditorKey] = useState(0);
  const [state, setState] = useState<SaveState>('saved');
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [hasDraft, setHasDraft] = useState(initialDetail.draft !== null);
  const [storedMode, setMode] = useStoredState<Mode>('wiki-editor-mode', 'split', MODES);
  const mode: Mode = narrow && storedMode === 'split' ? 'write' : storedMode;
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [uploads, setUploads] = useState(0);

  const view = useRef<EditorView | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const editorScroll = useRef<HTMLDivElement>(null);
  const previewScroll = useRef<HTMLDivElement>(null);

  // Saving works from refs: it runs from timers, after awaits, and on the way out.
  const draft = useRef<Text>(start);
  const saved = useRef<Text>(start);
  const version = useRef(initialDetail.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const stateRef = useRef<SaveState>('saved');

  const setSaveState = useCallback((next: SaveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const dirty = (): boolean => draft.current.title !== saved.current.title || draft.current.content !== saved.current.content;

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current;
    if (stateRef.current === 'conflict') return false;
    if (draft.current.title === saved.current.title && draft.current.content === saved.current.content) {
      setSaveState('saved');
      return true;
    }
    const value = { ...draft.current };
    setSaveState('saving');
    const attempt = (async () => {
      try {
        const result = await api.saveDraft(initialDetail.id, { ...value, version: version.current });
        if ('error' in result) {
          setConflict(result);
          setSaveState('conflict');
          return false;
        }
        version.current = result.version;
        saved.current = value;
        setHasDraft(true);
        setProblem(null);
        if (draft.current.title !== value.title || draft.current.content !== value.content) {
          timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
        } else setSaveState('saved');
        return true;
      } catch (error) {
        setSaveState('error');
        setProblem(apiError(error, 'saveFailed'));
        return false;
      }
    })();
    inflight.current = attempt;
    try {
      return await attempt;
    } finally {
      inflight.current = null;
    }
  }, [initialDetail.id, apiError, setSaveState]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const schedule = useCallback(() => {
    if (stateRef.current === 'conflict') return;
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
  }, [setSaveState]);

  // Leaving with changes not saved yet asks first; leaving inside the app saves them.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (!dirty() && !inflight.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (timer.current) clearTimeout(timer.current);
      if (dirty() && stateRef.current !== 'conflict') void saveRef.current();
    };
  }, []);

  const onTitle = (event: ChangeEvent<HTMLInputElement>): void => {
    setTitle(event.target.value);
    draft.current = { ...draft.current, title: event.target.value };
    schedule();
  };

  const onContent = useCallback(
    (text: string) => {
      setContent(text);
      draft.current = { ...draft.current, content: text };
      schedule();
    },
    [schedule],
  );

  /** Start again from text that came from elsewhere: someone else's draft, or the published page. */
  const reset = (text: Text, nextVersion: number): void => {
    if (timer.current) clearTimeout(timer.current);
    draft.current = text;
    saved.current = text;
    version.current = nextVersion;
    setTitle(text.title);
    setContent(text.content);
    setOpening(text.content);
    setEditorKey(key => key + 1);
    setConflict(null);
    setProblem(null);
    setSaveState('saved');
  };

  const takeTheirs = (): void => {
    if (!conflict) return;
    reset({ title: conflict.title, content: conflict.content }, conflict.version);
    setHasDraft(true);
  };

  const keepMine = (): void => {
    if (!conflict) return;
    version.current = conflict.version;
    setConflict(null);
    setSaveState('saving');
    void save();
  };

  const onImages = useCallback(
    async (files: File[], at: number | null, target: EditorView) => {
      let position = at;
      for (const file of files) {
        setUploads(count => count + 1);
        try {
          const image = await api.uploadImage(file);
          const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]\\]/g, '').slice(0, 80) || t('imageAlt');
          target.dispatch(insertImage(target.state, `![${alt}](${image.url})`, position));
          position = null;
        } catch (error) {
          toast.show(apiError(error, 'uploadFailed'), 'error');
        } finally {
          setUploads(count => count - 1);
        }
      }
    },
    [t, toast, apiError],
  );

  const flushAndPublish = async (): Promise<void> => {
    if (!draft.current.title.trim()) {
      toast.show(apiError(new ApiError('invalidTitle'), 'publishFailed'), 'error');
      return;
    }
    if (await save()) setPublishing(true);
  };

  const publish = async (message: string): Promise<void> => {
    try {
      await api.publish(initialDetail.id, message || null, version.current);
      saved.current = { ...draft.current };
      setPublishing(false);
      toast.show(t('published'), 'success');
      const fresh = await api.node(initialDetail.id).catch(() => null);
      router.push(urls.page(fresh?.path ?? detail.path));
      refresh();
    } catch (error) {
      toast.show(apiError(error, 'publishFailed'), 'error');
    }
  };

  const discard = async (): Promise<void> => {
    try {
      if (timer.current) clearTimeout(timer.current);
      if (inflight.current) await inflight.current;
      await api.discardDraft(initialDetail.id);
      const fresh = await api.node(initialDetail.id);
      setDetail(fresh);
      reset(startingText(fresh), fresh.version);
      setHasDraft(false);
      setDiscarding(false);
      toast.show(t('discarded'));
      refresh();
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  // In split view the preview follows the editor down the page.
  useEffect(() => {
    const from = editorScroll.current;
    const to = previewScroll.current;
    if (mode !== 'split' || !from || !to) return;
    const follow = (): void => {
      const room = from.scrollHeight - from.clientHeight;
      to.scrollTop = room > 0 ? (from.scrollTop / room) * (to.scrollHeight - to.clientHeight) : 0;
    };
    from.addEventListener('scroll', follow, { passive: true });
    return () => from.removeEventListener('scroll', follow);
  }, [mode]);

  const previewText = useDeferredValue(content);
  const rendered = useMemo(() => (mode === 'write' ? null : renderMarkdown(previewText)), [previewText, mode]);
  const words = useMemo(() => previewText.trim().split(/\s+/).filter(Boolean).length, [previewText]);

  const titles = useMemo(() => new Map(tree.map(node => [node.id, node])), [tree]);
  const crumbs = ancestorIds(tree, initialDetail.id).flatMap(id => {
    const node = titles.get(id);
    return node ? [{ title: node.title, path: node.path }] : [];
  });

  const unpublished = detail.published === null;
  const changed = hasDraft || state !== 'saved' || unpublished;
  const pageUrl = urls.page(detail.path);

  const menu: MenuAction[] = [
    { label: t('menu.view'), icon: Eye, onSelect: () => router.push(pageUrl), hidden: unpublished },
    { label: t('menu.history'), icon: History, onSelect: () => router.push(urls.history(initialDetail.id)), hidden: unpublished },
    { label: t('menu.share'), icon: Share2, onSelect: () => openDialog({ kind: 'share', id: initialDetail.id }) },
    { label: t('menu.settings'), icon: Settings2, onSelect: () => openDialog({ kind: 'settings', id: initialDetail.id }) },
    { label: t('menu.discard'), icon: RotateCcw, onSelect: () => setDiscarding(true), hidden: unpublished || !hasDraft },
    { label: t('menu.delete'), icon: Trash, danger: true, onSelect: () => openDialog({ kind: 'delete', id: initialDetail.id }) },
  ];

  /** What a toolbar button does, when it is clicked. */
  const onTool = (id: ToolId): void => {
    const target = view.current;
    switch (id) {
      case 'heading':
        return void run(target, cycleHeading);
      case 'bold':
        return void run(target, state => toggleWrap(state, '**'));
      case 'italic':
        return void run(target, state => toggleWrap(state, '_'));
      case 'strikethrough':
        return void run(target, state => toggleWrap(state, '~~'));
      case 'code':
        return void run(target, state => toggleWrap(state, '`'));
      case 'link':
        return void run(target, state => link(state, t('linkText')));
      case 'pageLink':
        return setPicking(true);
      case 'bullets':
        return void run(target, state => toggleLinePrefix(state, '- '));
      case 'numbers':
        return void run(target, state => toggleLinePrefix(state, '1. '));
      case 'tasks':
        return void run(target, state => toggleLinePrefix(state, '- [ ] '));
      case 'quote':
        return void run(target, state => toggleLinePrefix(state, '> '));
      case 'codeBlock':
        return void run(target, codeBlock);
      case 'table':
        return void run(target, state => insertBlock(state, table(t('tableColumn'), t('tableCell'))));
      case 'image':
        return imageInput.current?.click();
      case 'rule':
        return void run(target, state => insertBlock(state, '---'));
    }
  };

  const insertCallout = (kind: Callout): void => {
    const text = t('calloutText');
    run(view.current, state => insertBlock(state, `:::${kind}\n${text}\n:::`, { at: kind.length + 4, length: text.length }));
  };
  const callouts: MenuAction[] = CALLOUTS.map((kind: Callout) => ({
    label: t(`callouts.${kind}`),
    icon: MessageSquareText,
    onSelect: () => insertCallout(kind),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Like PageHeader: the first row is centred 28px from the top, with the switcher in it. */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-1 gap-y-2 border-b border-line px-3 pt-[7px] pb-1.5 sm:flex-nowrap sm:gap-x-2 sm:px-4 lg:px-5">
        <AppSwitcher className="mr-1 flex h-[42px] items-center self-start" />
        <Link
          href={unpublished ? '/wiki' : pageUrl}
          title={t('back')}
          aria-label={t('back')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-muted hover:text-ink"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="hidden min-w-0 flex-1 text-sm text-ink-muted md:block">
          <Breadcrumbs crumbs={crumbs} />
        </div>
        <div className="min-w-0 flex-1 md:hidden" />
        <SaveStatus state={state} problem={problem} conflict={conflict} onRetry={() => void save()} onTheirs={takeTheirs} onMine={keepMine} />
        <Segmented<Mode>
          ariaLabel={t('mode.label')}
          iconOnly
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: t('mode.write'), icon: PenLine },
            ...(narrow ? [] : [{ value: 'split' as const, label: t('mode.split'), icon: Columns2 }]),
            { value: 'preview', label: t('mode.preview'), icon: Eye },
          ]}
        />
        <Button size="sm" icon={<Send size={15} />} onClick={() => void flushAndPublish()} disabled={!changed || state === 'conflict'}>
          {t('publish')}
        </Button>
        <ActionMenu label={t('menu.label')} actions={menu} triggerClassName="size-8">
          <MoreHorizontal size={17} aria-hidden="true" />
        </ActionMenu>
      </header>

      {mode !== 'preview' ? (
        <div role="toolbar" aria-label={t('toolbar.label')} className="scrollbar-hidden flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1.5 sm:px-4">
          {TOOLS.map((group, index) => (
            <div key={index} className="flex items-center gap-0.5">
              {index > 0 ? <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-line" /> : null}
              {group.map(item => (
                <button
                  key={item.id}
                  type="button"
                  title={t(`toolbar.${item.id}`)}
                  aria-label={t(`toolbar.${item.id}`)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onTool(item.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <item.icon size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          ))}
          <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-line" />
          <ActionMenu label={t('toolbar.callout')} actions={callouts} triggerClassName="size-8">
            <MessageSquareText size={17} aria-hidden="true" />
          </ActionMenu>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            multiple
            className="sr-only"
            aria-label={t('toolbar.image')}
            onChange={event => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length && view.current) void onImages(files, null, view.current);
            }}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {mode !== 'preview' ? (
          <div ref={editorScroll} className={cn('themed-scroll min-w-0 flex-1 overflow-y-auto', mode === 'split' && 'w-1/2 flex-none')}>
            <div className="mx-auto max-w-[48rem] px-5 pt-6 sm:px-8">
              <input
                value={title}
                onChange={onTitle}
                maxLength={LIMITS.title}
                placeholder={t('titlePlaceholder')}
                aria-label={t('titleLabel')}
                className="mb-4 w-full bg-transparent text-[1.9rem] leading-tight font-bold tracking-tight text-ink outline-hidden placeholder:text-ink-faint/70"
              />
              <MarkdownEditor
                key={editorKey}
                initial={opening}
                onChange={onContent}
                onImages={(files, at, target) => void onImages(files, at, target)}
                onSave={() => void save()}
                onReady={editor => {
                  view.current = editor;
                }}
                placeholder={t('placeholder')}
                linkPlaceholder={t('linkText')}
                label={t('contentLabel')}
              />
            </div>
          </div>
        ) : null}
        {mode !== 'write' && rendered ? (
          <div
            ref={previewScroll}
            className={cn('themed-scroll min-w-0 flex-1 overflow-y-auto', mode === 'split' && 'w-1/2 flex-none border-l border-line bg-raised/40 dark:bg-canvas/40')}
          >
            <div className="mx-auto max-w-[48rem] px-5 pt-6 pb-[40vh] sm:px-8">
              {/* Beside the editor, the title is already in view in its field. */}
              {mode === 'preview' ? <h1 className="mb-6 text-[1.9rem] leading-tight font-bold tracking-tight text-ink">{title || t('untitled')}</h1> : null}
              <MarkdownView tree={rendered.tree} preview />
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-line px-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5" role="status" aria-live="polite">
          {uploads > 0 ? (
            <>
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              {t('uploading', { count: uploads })}
            </>
          ) : unpublished ? (
            t('neverPublished')
          ) : hasDraft ? (
            t('unpublishedChanges')
          ) : (
            t('upToDate')
          )}
        </span>
        <span className="tabular-nums">{t('words', { count: words })}</span>
      </footer>

      <PublishDialog
        open={publishing}
        before={detail.published ? { title: detail.published.title, content: detail.published.content } : null}
        after={{ title, content }}
        firstTime={unpublished}
        onClose={() => setPublishing(false)}
        onPublish={publish}
      />
      <PagePicker
        open={picking}
        except={initialDetail.id}
        onClose={() => setPicking(false)}
        onPick={(pickedTitle, path) => {
          setPicking(false);
          requestAnimationFrame(() => run(view.current, state => pageLink(state, pickedTitle, path)));
        }}
      />
      <Confirm
        open={discarding}
        title={t('discardTitle')}
        confirmLabel={t('discardConfirm')}
        danger
        onCancel={() => setDiscarding(false)}
        onConfirm={discard}
      >
        {t('discardBody')}
      </Confirm>
    </div>
  );
}

function SaveStatus({
  state,
  problem,
  conflict,
  onRetry,
  onTheirs,
  onMine,
}: {
  state: SaveState;
  problem: string | null;
  conflict: DraftConflict | null;
  onRetry(): void;
  onTheirs(): void;
  onMine(): void;
}) {
  const t = useTranslations('wiki.editor');
  if (state === 'saved') {
    return (
      <span className="hidden shrink-0 items-center gap-1.5 text-sm text-ink-muted sm:flex">
        <Check size={14} aria-hidden="true" />
        {t('saved')}
      </span>
    );
  }
  if (state === 'saving') return <span className="hidden shrink-0 text-sm text-ink-muted sm:inline">{t('saving')}</span>;
  if (state === 'error') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="truncate font-medium text-danger">{problem ?? t('notSaved')}</span>
        <button type="button" onClick={onRetry} className="shrink-0 rounded-md px-2 py-1 font-semibold text-accent hover:bg-muted">
          {t('retry')}
        </button>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm">
      <AlertTriangle size={15} aria-hidden="true" className="shrink-0 text-warning" />
      <span className="truncate font-medium text-ink">{conflict?.by ? t('conflictBy', { name: conflict.by.name ?? conflict.by.username }) : t('conflict')}</span>
      <button type="button" onClick={onTheirs} className="shrink-0 rounded-md px-2 py-1 font-semibold text-ink hover:bg-muted">
        {t('takeTheirs')}
      </button>
      <button type="button" onClick={onMine} className="shrink-0 rounded-md px-2 py-1 font-semibold text-accent hover:bg-muted">
        {t('keepMine')}
      </button>
    </span>
  );
}
