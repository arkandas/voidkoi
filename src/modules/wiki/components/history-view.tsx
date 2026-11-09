'use client';

import { ArrowLeft, Columns2, FileText, GitCompareArrows, History, Loader2, RotateCcw, Rows3 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-layout';
import { MarkdownView } from '@/modules/wiki/components/markdown/markdown-view';
import { Avatar, Button, Confirm, Segmented, Select, Spinner, useToast } from '@/components/ui';
import { Breadcrumbs } from '@/modules/wiki/components/page-header';
import { api, urls } from '@/modules/wiki/lib/api';
import type { PageDetail, PersonDto, RevisionDto } from '@/modules/wiki/lib/api-types';
import { cn } from '@/lib/cn';
import { collapse, diffStats, diffText, sideBySide, type DiffLine, type Gap, type Row } from '@/modules/wiki/lib/diff-view';
import { renderMarkdown } from '@/modules/wiki/lib/markdown/render';
import { useApiError } from '@/lib/use-api-error';
import { useStoredState } from '@/lib/use-stored-state';
import type { Crumb } from '@/modules/wiki/lib/views';

/** One entry in the list: a published version, or the draft on top of them. */
interface Version {
  key: string;
  /** Null for the draft. */
  revision: RevisionDto | null;
  title: string;
  message: string | null;
  by: PersonDto | null;
  at: string;
  current: boolean;
}

interface Text {
  title: string;
  content: string;
}

const LAYOUTS = ['unified', 'split'] as const;
type Layout = (typeof LAYOUTS)[number];

/** A page's versions, newest first, each with what changed from the one before. */
export function HistoryView({ detail, revisions, crumbs }: { detail: PageDetail; revisions: RevisionDto[]; crumbs: Crumb[] }) {
  const t = useTranslations('wiki.history');
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [layout, setLayout] = useStoredState<Layout>('wiki-diff-layout', 'unified', LAYOUTS);
  const [tab, setTab] = useState<'changes' | 'text'>('changes');
  const [texts, setTexts] = useState<Map<string, Text>>(() => {
    const known = new Map<string, Text>();
    if (detail.draft) known.set('draft', { title: detail.draft.title, content: detail.draft.content });
    return known;
  });
  const [restoring, setRestoring] = useState<Version | null>(null);
  const [all, setAll] = useState(false);

  const versions = useMemo<Version[]>(() => {
    const list: Version[] = revisions.map(revision => ({
      key: String(revision.id),
      revision,
      title: revision.title,
      message: revision.message,
      by: revision.author,
      at: revision.createdAt,
      current: revision.published,
    }));
    if (detail.draft) {
      list.unshift({ key: 'draft', revision: null, title: detail.draft.title, message: null, by: detail.draft.by, at: detail.draft.at, current: false });
    }
    return list;
  }, [revisions, detail.draft]);

  const [selected, setSelected] = useState<string>(versions[0]?.key ?? '');
  const index = versions.findIndex(version => version.key === selected);
  const version = versions[index] ?? null;
  const [against, setAgainst] = useState<string | null>(null);
  const base = against ?? versions[index + 1]?.key ?? null;

  // The texts of the two versions being compared, fetched once each.
  useEffect(() => {
    const wanted = [selected, base].filter((key): key is string => !!key && key !== 'draft' && !texts.has(key));
    if (wanted.length === 0) return;
    let cancelled = false;
    Promise.all(wanted.map(key => api.revision(detail.id, Number(key)).then(revision => [key, { title: revision.title, content: revision.content }] as const)))
      .then(loaded => {
        if (!cancelled) setTexts(current => new Map([...current, ...loaded]));
      })
      .catch(error => toast.show(apiError(error, 'loadFailed'), 'error'));
    return () => {
      cancelled = true;
    };
  }, [selected, base, texts, detail.id, toast, apiError]);

  const newer = texts.get(selected) ?? null;
  const older = useMemo(() => (base ? texts.get(base) ?? null : { title: '', content: '' }), [base, texts]);
  const ready = newer !== null && older !== null;

  const lines = useMemo(() => (ready ? diffText(older.content, newer.content) : []), [ready, older, newer]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  const items = useMemo(() => (all ? lines : collapse(lines)), [lines, all]);
  const rendered = useMemo(() => (tab === 'text' && newer ? renderMarkdown(newer.content) : null), [tab, newer]);

  const label = (entry: Version): string => (entry.revision ? t('version', { number: entry.revision.number }) : t('draft'));
  const when = (iso: string): string => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  const restore = async (): Promise<void> => {
    if (!restoring?.revision) return;
    try {
      await api.restoreRevision(detail.id, restoring.revision.id);
      setRestoring(null);
      toast.show(t('restored', { number: restoring.revision.number }), 'success');
      router.push(urls.edit(detail.id));
    } catch (error) {
      toast.show(apiError(error, 'restoreFailed'), 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        lead={
          <Link
            href={urls.page(detail.path)}
            title={t('back')}
            aria-label={t('back')}
            className="-mx-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-muted hover:text-ink"
          >
            <ArrowLeft size={20} />
          </Link>
        }
        icon={<History size={18} />}
        title={t('heading')}
        subtitle={<Breadcrumbs crumbs={crumbs} />}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav aria-label={t('versions')} className="themed-scroll max-h-64 shrink-0 overflow-y-auto border-b border-line p-2 lg:max-h-none lg:w-80 lg:border-r lg:border-b-0">
          {versions.length === 0 ? <p className="p-4 text-sm text-ink-muted">{t('none')}</p> : null}
          <ul className="flex flex-col gap-1">
            {versions.map(entry => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(entry.key);
                    setAgainst(null);
                  }}
                  aria-current={entry.key === selected ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors',
                    entry.key === selected ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('text-sm font-semibold', entry.revision ? 'text-ink' : 'text-accent')}>{label(entry)}</span>
                    {entry.current ? (
                      <span className="rounded-full bg-success-soft px-2 text-[11px] leading-5 font-semibold text-success">{t('live')}</span>
                    ) : null}
                  </span>
                  {entry.message ? <span className="line-clamp-2 text-sm text-ink">{entry.message}</span> : null}
                  <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                    {entry.by ? <Avatar person={entry.by} size="xs" /> : null}
                    <span className="truncate">{entry.by ? t('byOn', { name: entry.by.name ?? entry.by.username, date: when(entry.at) }) : when(entry.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {version ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:px-5">
                <Segmented<'changes' | 'text'>
                  ariaLabel={t('show')}
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'changes', label: t('changes'), icon: GitCompareArrows },
                    { value: 'text', label: t('text'), icon: FileText },
                  ]}
                />
                {tab === 'changes' ? (
                  <>
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                      <span className="hidden sm:inline">{t('against')}</span>
                      <span className="w-44">
                        <Select
                          aria-label={t('against')}
                          value={base ?? ''}
                          onChange={event => setAgainst(event.target.value || null)}
                          options={[
                            { value: '', label: t('nothing') },
                            ...versions.filter(entry => entry.key !== selected).map(entry => ({ value: entry.key, label: label(entry) })),
                          ]}
                          className="h-9 sm:h-8"
                        />
                      </span>
                    </label>
                    <Segmented<Layout>
                      ariaLabel={t('layout')}
                      iconOnly
                      value={layout}
                      onChange={setLayout}
                      options={[
                        { value: 'unified', label: t('unified'), icon: Rows3 },
                        { value: 'split', label: t('split'), icon: Columns2 },
                      ]}
                    />
                    {ready ? (
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        <span className="font-semibold text-success">+{stats.added}</span>
                        <span className="font-semibold text-danger">−{stats.removed}</span>
                      </span>
                    ) : null}
                  </>
                ) : null}
                <div className="flex-1" />
                {version.revision && !version.current ? (
                  <Button size="sm" variant="outline" icon={<RotateCcw size={15} />} onClick={() => setRestoring(version)}>
                    {t('restore')}
                  </Button>
                ) : null}
              </div>

              <div className="themed-scroll min-h-0 flex-1 overflow-auto">
                {!ready ? (
                  <div className="flex justify-center py-16">
                    <Spinner />
                  </div>
                ) : tab === 'text' ? (
                  <div className="mx-auto max-w-[48rem] px-5 pt-7 pb-24 sm:px-8">
                    <h1 className="mb-6 text-[2rem] leading-tight font-bold tracking-tight text-ink">{newer.title}</h1>
                    {rendered ? <MarkdownView tree={rendered.tree} preview /> : null}
                  </div>
                ) : (
                  <div className="p-3 sm:p-5">
                    {older.title !== newer.title ? (
                      <p className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                        <span className="text-ink-muted">{t('titleChanged')} </span>
                        {older.title ? <del className="rounded-sm bg-danger-soft px-1 text-danger">{older.title}</del> : null}{' '}
                        <ins className="rounded-sm bg-success-soft px-1 text-success no-underline">{newer.title}</ins>
                      </p>
                    ) : null}
                    {lines.length === 0 || (stats.added === 0 && stats.removed === 0) ? (
                      <p className="px-2 py-10 text-center text-ink-muted">{t('noChanges')}</p>
                    ) : (
                      <DiffTable items={items} layout={layout} onShowAll={() => setAll(true)} />
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-10 text-ink-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
        </section>
      </div>

      <Confirm
        open={restoring !== null}
        title={t('restoreTitle')}
        confirmLabel={t('restoreConfirm')}
        onCancel={() => setRestoring(null)}
        onConfirm={restore}
      >
        {restoring?.revision ? t('restoreBody', { number: restoring.revision.number }) : null}
      </Confirm>
    </div>
  );
}

function Words({ line }: { line: DiffLine }) {
  return (
    <>
      {line.parts.map((part, index) =>
        part.changed ? (
          <span key={index} className={cn('rounded-[3px]', line.kind === 'added' ? 'bg-success/25' : 'bg-danger/25')}>
            {part.text}
          </span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

const ROW_TONE = {
  same: '',
  added: 'bg-success-soft',
  removed: 'bg-danger-soft',
} as const;

function LineNumber({ value }: { value: number | null }) {
  return <td className="w-11 border-r border-line px-2 text-right align-top text-ink-faint select-none">{value ?? ''}</td>;
}

function GapRow({ gap, columns, onShowAll }: { gap: Gap; columns: number; onShowAll(): void }) {
  const t = useTranslations('wiki.history');
  return (
    <tr>
      <td colSpan={columns} className="border-y border-line bg-muted/60 px-3 py-1 text-center dark:bg-canvas/60">
        <button type="button" onClick={onShowAll} className="text-xs font-medium text-ink-muted hover:text-ink">
          {t('hidden', { count: gap.count })}
        </button>
      </td>
    </tr>
  );
}

/** The changes, line by line: one column with − and + lines, or old and new side by side. */
function DiffTable({ items, layout, onShowAll }: { items: Array<DiffLine | Gap>; layout: Layout; onShowAll(): void }) {
  const cell = 'px-3 align-top whitespace-pre-wrap break-words';
  if (layout === 'unified') {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full table-fixed border-collapse font-mono text-[12.5px] leading-6">
          <colgroup>
            <col className="w-11" />
            <col className="w-11" />
            <col className="w-6" />
            <col />
          </colgroup>
          <tbody>
            {items.map((item, index) =>
              item.kind === 'gap' ? (
                <GapRow key={index} gap={item} columns={4} onShowAll={onShowAll} />
              ) : (
                <tr key={index} className={ROW_TONE[item.kind]}>
                  <LineNumber value={item.oldNumber} />
                  <LineNumber value={item.newNumber} />
                  <td className={cn('text-center align-top select-none', item.kind === 'added' ? 'text-success' : item.kind === 'removed' ? 'text-danger' : 'text-ink-faint')}>
                    {item.kind === 'added' ? '+' : item.kind === 'removed' ? '−' : ''}
                  </td>
                  <td className={cell}>
                    <Words line={item} />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = sideBySide(items);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="w-full table-fixed border-collapse font-mono text-[12.5px] leading-6">
        <colgroup>
          <col className="w-11" />
          <col />
          <col className="w-11" />
          <col />
        </colgroup>
        <tbody>
          {rows.map((row, index) =>
            'kind' in row ? (
              <GapRow key={index} gap={row} columns={4} onShowAll={onShowAll} />
            ) : (
              <SplitRow key={index} row={row} cell={cell} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function SplitRow({ row, cell }: { row: Row; cell: string }) {
  const side = (line: DiffLine | null, which: 'left' | 'right') => {
    const number = line ? (which === 'left' ? line.oldNumber : line.newNumber) : null;
    return (
      <>
        <LineNumber value={number} />
        <td className={cn(cell, line ? ROW_TONE[line.kind] : 'bg-muted/40 dark:bg-canvas/40', which === 'left' && 'border-r border-line')}>
          {line ? <Words line={line} /> : null}
        </td>
      </>
    );
  };
  return (
    <tr>
      {side(row.left, 'left')}
      {side(row.right, 'right')}
    </tr>
  );
}
