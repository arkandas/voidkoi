'use client';

import { ChevronRight, Clock, Download, Expand, FolderOpen, LayoutGrid, List, Lock, Unlink } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { FileTile, isPage, PlayBadge } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { linkSource, Viewer, type ViewerSource } from '@/modules/files/components/viewer';
import { AuthSpinner } from '@/components/layout/auth-card';
import { AudioPanel, AudioPlayerProvider, MiniPlayer } from '@/modules/files/components/media/audio-player';
import { VideoPlayer } from '@/modules/files/components/media/video-player';
import { LinkShell as Shell, Notice, PasswordForm } from '@/modules/files/components/share/link-page';
import { Avatar, Button, IconButton, Segmented } from '@/components/ui';
import { api, download, urls } from '@/modules/files/lib/api';
import type { ItemDto, PublicShare } from '@/modules/files/lib/api-types';
import { ApiError } from '@/lib/error-codes';
import { cn } from '@/lib/cn';
import { fileKind, previewKind } from '@/lib/file-types';
import { formatBytes, formatDate, formatDateTime } from '@/lib/format';
import { sortItems } from '@/modules/files/lib/sort';
import { useStoredState } from '@/lib/use-stored-state';

/** 'auto' until the visitor picks: a grid when there are pictures to see, a list otherwise. */
const VIEWS = ['auto', 'list', 'grid'] as const;

function Preview({ token, item, source, onExpand }: { token: string; item: ItemDto; source: ViewerSource; onExpand(): void }) {
  const t = useTranslations('files.link');
  const kind = item.hasPreview ? 'image' : previewKind(item.mime, item.name);
  const url = item.hasPreview ? urls.linkPreview(token, item) : urls.linkContent(token, item.id);
  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={t('openPreview')}
        title={t('openPreview')}
        className="flex w-full cursor-zoom-in items-center justify-center bg-stage/95 p-3"
      >
        <img src={url} alt={item.name} className="max-h-[55dvh] max-w-full rounded-lg object-contain" />
      </button>
    );
  }
  if (kind === 'video') {
    return (
      <div className="bg-stage">
        <VideoPlayer item={item} source={source} compact />
      </div>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex justify-center bg-stage px-6 py-8">
        <AudioPanel items={[item]} item={item} source={source} onTrack={() => {}} compact />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 bg-muted px-6 py-10 dark:bg-canvas">
      <FileTile kind="file" mime={item.mime} name={item.name} className="size-24 rounded-3xl bg-accent-soft text-accent [&_svg]:size-12" />
      {kind ? (
        <Button size="sm" variant="outline" icon={<Expand size={15} />} onClick={onExpand}>
          {t('openPreview')}
        </Button>
      ) : null}
    </div>
  );
}

function ShareScreen({ token }: { token: string }) {
  const t = useTranslations('files.link');
  const tFiles = useTranslations('files.browser');
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const folderParam = params.get('folder');
  const folderId = folderParam && /^\d+$/.test(folderParam) ? Number(folderParam) : null;
  const [share, setShare] = useState<PublicShare | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState<{ items: ItemDto[]; index: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setShare(await api.publicShare(token, folderId));
      setFailed(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) setFailed(true);
      else setShare({ state: 'notFound' });
    }
  }, [token, folderId]);

  // The first look, and each folder opened. The state is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.publicShare(token, folderId).then(
      found => {
        if (cancelled) return;
        setShare(found);
        setFailed(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 0) setFailed(true);
        else setShare({ state: 'notFound' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, folderId]);

  const items = useMemo(
    () => (share?.state === 'ok' ? sortItems(share.items, { key: 'name', direction: 'asc' }, locale) : []),
    [share, locale],
  );

  const source = useMemo(() => linkSource(token), [token]);
  const [chosenView, setView] = useStoredState('files-link-view', 'auto', VIEWS);

  if (failed) {
    return (
      <Notice icon={<Unlink size={24} />} title={t('offline')}>
        <Button fullWidth onClick={() => void load()}>
          {t('retry')}
        </Button>
      </Notice>
    );
  }
  if (!share) return <AuthSpinner />;

  if (share.state === 'notFound') return <Notice icon={<Unlink size={24} />} title={t('notFound.title')} body={t('notFound.body')} />;
  if (share.state === 'expired') return <Notice icon={<Clock size={24} />} title={t('expired.title')} body={t('expired.body')} />;
  if (share.state === 'usedUp') return <Notice icon={<Download size={24} />} title={t('usedUp.title')} body={t('usedUp.body')} />;
  if (share.state === 'password') {
    return (
      <PasswordForm
        body={t('password.body', { name: share.owner })}
        unlock={password => api.unlock(token, password)}
        onUnlocked={() => void load()}
      />
    );
  }
  if (share.state === 'signIn') {
    const back = `/s/${token}${folderId ? `?folder=${folderId}` : ''}`;
    return (
      <Notice icon={<Lock size={24} />} title={t('signIn.title')} body={t('signIn.body', { name: share.owner })}>
        <Button fullWidth onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(back)}`)}>
          {t('signIn.button')}
        </Button>
      </Notice>
    );
  }
  if (share.state !== 'ok') return null;

  const owner = (
    <span className="flex items-center gap-1.5">
      <Avatar person={share.owner} size="xs" link={token} />
      {t('sharedBy', { name: share.owner.username })}
    </span>
  );
  const until = share.expiresAt ? <span className="text-ink-faint">{t('until', { date: formatDateTime(share.expiresAt, locale) })}</span> : null;

  if (share.root.kind === 'file') {
    const file = share.root;
    return (
      <Shell>
        <Preview token={token} item={file} source={source} onExpand={() => setViewing({ items: [file], index: 0 })} />
        <div className="space-y-5 px-6 py-6">
          <div>
            <h1 className="text-xl font-semibold break-words text-ink">{file.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className="tabular-nums">{formatBytes(file.size, locale)}</span>
              {owner}
              {until}
            </div>
          </div>
          <Button size="lg" fullWidth icon={<Download size={18} />} onClick={() => download(urls.linkContent(token, file.id, true))}>
            {t('download')}
          </Button>
        </div>
        {viewing ? (
          <Viewer items={viewing.items} index={0} source={source} onIndex={() => {}} onClose={() => setViewing(null)} />
        ) : null}
      </Shell>
    );
  }

  const folder = share.folder ?? share.root;
  const files = items.filter(item => item.kind === 'file');
  const go = (id: number | null) => router.push(`/s/${token}${id && id !== share.root.id ? `?folder=${id}` : ''}`);
  const view = chosenView === 'auto' ? (items.some(item => item.hasThumbnail) ? 'grid' : 'list') : chosenView;
  const open = (item: ItemDto): void => {
    if (item.kind === 'folder') go(item.id);
    else setViewing({ items: files, index: files.findIndex(file => file.id === item.id) });
  };
  const save = (item: ItemDto): void => {
    download(item.kind === 'file' ? urls.linkContent(token, item.id, true) : urls.linkZip(token, item.id));
  };
  const detail = (item: ItemDto): string =>
    item.kind === 'folder' ? tFiles('itemCount', { count: item.childCount ?? 0 }) : formatBytes(item.size, locale);
  const activate = (item: ItemDto) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => open(item),
    onKeyDown: (event: { key: string }) => {
      if (event.key === 'Enter') open(item);
    },
  });

  return (
    <Shell width="lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-ink">{folder.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {owner}
            {until}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<'list' | 'grid'>
            ariaLabel={tFiles('view')}
            iconOnly
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: tFiles('viewList'), icon: List },
              { value: 'grid', label: tFiles('viewGrid'), icon: LayoutGrid },
            ]}
          />
          <Button icon={<Download size={16} />} onClick={() => download(urls.linkZip(token, folder.id === share.root.id ? null : folder.id))}>
            {t('downloadAll')}
          </Button>
        </div>
      </div>

      {share.crumbs.length > 1 ? (
        <nav aria-label={tFiles('path')} className="flex flex-wrap items-center gap-0.5 px-4 pt-3 text-sm">
          {share.crumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-0.5">
              {index > 0 ? <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" /> : null}
              <button
                type="button"
                onClick={() => go(crumb.id)}
                className={`max-w-48 truncate rounded-lg px-2 py-1 font-medium hover:bg-muted ${index === share.crumbs.length - 1 ? 'text-ink' : 'text-ink-muted'}`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {items.length === 0 ? (
        <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-ink-muted">
          <FolderOpen size={26} className="text-ink-faint" aria-hidden="true" />
          {t('emptyFolder')}
        </p>
      ) : view === 'grid' ? (
        <ul className="themed-scroll grid max-h-[60dvh] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 overflow-y-auto p-3">
          {items.map(item => {
            const picture = item.hasThumbnail ? urls.linkThumbnail(token, item) : null;
            return (
              <li key={item.id}>
                <div
                  {...activate(item)}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-line-strong focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
                >
                  <div
                    className={cn(
                      'relative flex aspect-[4/3] items-center justify-center overflow-hidden',
                      item.kind === 'folder' ? 'bg-accent-soft text-accent' : 'bg-muted text-ink-muted',
                    )}
                  >
                    {picture ? (
                      <>
                        <img
                          src={picture}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className={cn('size-full object-cover', isPage(fileKind(item.mime, item.name)) && 'object-left-top')}
                        />
                        {fileKind(item.mime, item.name) === 'video' ? <PlayBadge large /> : null}
                      </>
                    ) : (
                      <FileTile kind={item.kind} mime={item.mime} name={item.name} className="size-14 rounded-2xl bg-transparent [&_svg]:size-9" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 p-2.5 pr-1">
                    <div className="min-w-0 flex-1">
                      <FileName name={item.name} folder={item.kind === 'folder'} className="text-sm font-semibold text-ink" />
                      <p className="truncate text-xs text-ink-muted tabular-nums">{detail(item)}</p>
                    </div>
                    <IconButton
                      size="sm"
                      label={t('downloadNamed', { name: item.name })}
                      icon={<Download size={16} />}
                      onClick={event => {
                        event.stopPropagation();
                        save(item);
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="themed-scroll max-h-[60dvh] space-y-0.5 overflow-y-auto p-2">
          {items.map(item => (
            <li key={item.id}>
              <div
                {...activate(item)}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
              >
                <FileTile
                  kind={item.kind}
                  mime={item.mime}
                  name={item.name}
                  thumbnail={item.hasThumbnail ? urls.linkThumbnail(token, item) : null}
                />
                <div className="min-w-0 flex-1">
                  <FileName name={item.name} folder={item.kind === 'folder'} className="font-semibold text-ink" />
                  <p className="truncate text-sm text-ink-muted tabular-nums">
                    {detail(item)} · {formatDate(item.updatedAt, locale)}
                  </p>
                </div>
                <IconButton
                  label={t('downloadNamed', { name: item.name })}
                  icon={<Download size={18} />}
                  onClick={event => {
                    event.stopPropagation();
                    save(item);
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <MiniPlayer className="border-t border-line" />

      {viewing ? (
        <Viewer
          items={viewing.items}
          index={viewing.index}
          source={source}
          onIndex={index => setViewing(current => (current ? { ...current, index } : current))}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </Shell>
  );
}

export function ShareView({ token }: { token: string }) {
  return (
    <Suspense fallback={<AuthSpinner />}>
      <AudioPlayerProvider>
        <ShareScreen token={token} />
      </AudioPlayerProvider>
    </Suspense>
  );
}
