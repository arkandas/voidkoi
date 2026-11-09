'use client';

import { FolderOpen, MessageCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { Button, EmptyState, IconButton, Segmented, Spinner, useToast } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { AttachmentViewer } from '@/modules/talk/components/files/attachment-viewer';
import { FileIcon } from '@/components/ui/file-icon';
import { DownloadLink } from '@/modules/talk/components/files/download-link';
import { api, urls } from '@/modules/talk/lib/api';
import { iconType } from '@/modules/talk/lib/files';
import { useRealtimeMessages } from '@/modules/talk/lib/hooks/use-realtime';
import type { FilesFilter, SharedFile } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

const PAGE_SIZE = 60;

export function FilesPage() {
  const t = useTranslations('talk.files');
  const toast = useToast();
  const router = useRouter();
  const locale = useLocale();
  const time = useTimeFormat();

  const filters: Array<{ value: FilesFilter; label: string }> = [
    { value: 'all', label: t('filterAll') },
    { value: 'sent', label: t('filterSent') },
    { value: 'received', label: t('filterReceived') },
  ];

  const [filter, setFilter] = useState<FilesFilter>('all');
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewing, setViewing] = useState<SharedFile | null>(null);
  /** Bumped to fetch again when something is shared or withdrawn elsewhere. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await api.files({ filter, limit: PAGE_SIZE });
        if (cancelled) return;
        setFiles(page.files);
        setNextBefore(page.nextBefore);
      } catch {
        if (!cancelled) toast.show(t('loadFailed'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, reloadToken]);

  useRealtimeMessages(message => {
    // A file arriving, or one sent from another tab, belongs at the top.
    if (message.type === 'message' && message.message.attachment) setReloadToken(token => token + 1);
    // A withdrawn file is gone for both people.
    if (message.type === 'message-deleted') {
      setFiles(current => current.filter(file => file.messageId !== message.messageId));
      setViewing(current => (current?.messageId === message.messageId ? null : current));
    }
  });

  const loadMore = async (): Promise<void> => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.files({ filter, before: nextBefore, limit: PAGE_SIZE });
      setFiles(current => [...current, ...page.files]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.show(t('loadMoreFailed'), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  // A group is opened by its id; a 1:1 chat by the person, which also brings it back if it was deleted since.
  const showInChat = useCallback(
    (file: SharedFile) => router.push(file.other ? `/talk?with=${file.other.id}` : `/talk?conversation=${file.conversationId}`),
    [router],
  );
  const closeViewer = useCallback(() => setViewing(null), []);

  /** Where it was shared: the other person, or the group. */
  const place = (file: SharedFile): string => file.group?.name ?? file.other?.displayName ?? file.sender.displayName;

  /** "To María", "From Ada", "To Familia", "From Ada in Familia". */
  const who = (file: SharedFile): string =>
    file.direction === 'sent'
      ? t('to', { name: place(file) })
      : file.group
        ? t('fromInGroup', { name: file.sender.displayName, group: file.group.name })
        : t('from', { name: file.sender.displayName });

  const photoLabel = (file: SharedFile): string => {
    const date = time.callTime(file.sharedAt);
    return file.group
      ? t('openPhotoGroup', { direction: file.direction, name: file.sender.displayName, group: file.group.name, date })
      : t('openPhoto', { direction: file.direction, name: place(file), date });
  };

  // Pictures as a wall of thumbnails, everything else as a list.
  const photos = files.filter(file => file.isImage && file.hasPreview);
  const documents = files.filter(file => !(file.isImage && file.hasPreview));

  return (
    <PageLayout
      className="space-y-2"
      header={
        <PageHeader
          icon={<FolderOpen size={18} />}
          title={t('title')}
          action={
            <Segmented<FilesFilter>
              ariaLabel={t('filterLabel')}
              value={filter}
              onChange={next => {
                if (next === filter) return;
                setLoading(true);
                setFilter(next);
              }}
              options={filters}
            />
          }
        />
      }
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('loading')} />
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<FolderOpen size={24} />}
          title={filter === 'sent' ? t('emptySent') : filter === 'received' ? t('emptyReceived') : t('empty')}
        />
      ) : (
        <>
          {photos.length > 0 ? (
            <section aria-labelledby="talk-files-photos" className="pb-2">
              <h2 id="talk-files-photos" className="px-1 pb-2 text-sm font-semibold text-ink-muted">
                {t('photos')}
              </h2>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                {photos.map(file => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setViewing(file)}
                      aria-label={photoLabel(file)}
                      className="block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-muted transition-opacity hover:opacity-90 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/40"
                    >
                      <img src={urls.preview(file.id)} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {documents.length > 0 ? (
            <section aria-labelledby="talk-files-documents">
              <h2 id="talk-files-documents" className="px-1 pb-2 text-sm font-semibold text-ink-muted">
                {t('documents')}
              </h2>
              <ul className="space-y-2">
                {documents.map(file => (
                  <li key={file.id} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-xs sm:px-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent dark:bg-muted">
                      <FileIcon mime={iconType(file)} name={file.name} />
                    </span>
                    <div className="min-w-0 flex-1">
                      {file.isImage ? (
                        // A picture that came without a preview still opens in the viewer.
                        <button
                          type="button"
                          onClick={() => setViewing(file)}
                          className="block max-w-full truncate text-left text-[15px] font-semibold text-ink hover:underline focus:outline-hidden focus-visible:underline"
                        >
                          {file.name}
                        </button>
                      ) : (
                        <p className="truncate text-[15px] font-semibold text-ink" title={file.name}>
                          {file.name}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-sm text-ink-muted tabular-nums">
                        {formatBytes(file.sizeBytes, locale)} · {who(file)} · {time.callTime(file.sharedAt)}
                      </p>
                    </div>
                    <IconButton variant="ghost" label={t('showInChat', { name: place(file) })} onClick={() => showInChat(file)} icon={<MessageCircle size={18} />} className="size-9" />
                    <DownloadLink
                      attachmentId={file.id}
                      label={t('download', { name: file.name })}
                      className="size-10 border border-line-strong bg-raised text-ink shadow-xs hover:border-ink-faint hover:bg-muted focus-visible:ring-line-strong dark:bg-card"
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {nextBefore !== null ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t('loadingMore') : t('loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {viewing ? (
        <AttachmentViewer attachment={viewing} detail={`${who(viewing)} · ${time.callTime(viewing.sharedAt)}`} onClose={closeViewer} onShowInChat={() => showInChat(viewing)} />
      ) : null}
    </PageLayout>
  );
}
