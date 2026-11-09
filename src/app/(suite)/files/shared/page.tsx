'use client';

import { Clock, Copy, Globe, HardDrive, Inbox, KeyRound, Link as LinkIcon, Lock, Settings2, Unlink, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { FileTile } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { ShareDialog } from '@/modules/files/components/share-dialog';
import { appSource, Viewer } from '@/modules/files/components/viewer';
import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { AvatarStack, Button, Confirm, EmptyState, IconButton, Spinner, useToast } from '@/components/ui';
import { api, urls } from '@/modules/files/lib/api';
import type { ItemDto, SharedItem } from '@/modules/files/lib/api-types';
import { formatBytes, formatDate } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';


function Chip({ icon, children, tone = 'accent' }: { icon: React.ReactNode; children: React.ReactNode; tone?: 'accent' | 'muted' | 'danger' }) {
  const tones = {
    accent: 'border-accent/50 text-accent',
    muted: 'border-line-strong text-ink-muted',
    danger: 'border-danger/50 text-danger',
  };
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

/** Everything I share, with how: the link and its settings, and who it's shared with. */
export default function SharedPage() {
  const t = useTranslations('files.shared');
  const tFiles = useTranslations('files.browser');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [shares, setShares] = useState<SharedItem[] | null>(null);
  const [managing, setManaging] = useState<ItemDto | null>(null);
  const [stopping, setStopping] = useState<SharedItem | null>(null);
  const [viewing, setViewing] = useState<ItemDto | null>(null);

  const load = useCallback(async () => {
    try {
      setShares(await api.myShares());
    } catch (error) {
      toast.show(apiError(error, 'loadFailed'), 'error');
      setShares([]);
    }
  }, [toast, apiError]);

  // The first look. The list is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.myShares().then(
      found => {
        if (!cancelled) setShares(found);
      },
      (error: unknown) => {
        if (cancelled) return;
        toast.show(apiError(error, 'loadFailed'), 'error');
        setShares([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [toast, apiError]);

  const copy = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t('copied'), 'success');
    } catch {
      toast.show(t('copyFailed'), 'error');
    }
  };

  const stop = async (share: SharedItem): Promise<void> => {
    try {
      if (share.link) await api.deleteLink(share.item.id);
      if (share.uploadLink) await api.deleteUploadLink(share.item.id);
      if (share.people.length > 0) await api.setPeople(share.item.id, []);
      toast.show(t('stopped', { name: share.item.name }), 'success');
      setStopping(null);
      await load();
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const open = (item: ItemDto): void => {
    if (item.kind === 'folder') router.push(`/files/${item.id}`);
    else setViewing(item);
  };

  /** What stopping does to this item, sentence by sentence. */
  const consequences = (share: SharedItem): string => {
    const links = Number(!!share.link) + Number(!!share.uploadLink);
    return [
      links === 1 ? t('stopLink', { name: share.item.name }) : links === 2 ? t('stopLinks', { name: share.item.name }) : null,
      share.people.length > 0 ? t('stopPeople', { count: share.people.length }) : null,
    ]
      .filter(Boolean)
      .join(' ');
  };

  return (
    <PageLayout header={<PageHeader icon={<LinkIcon size={18} />} title={t('title')} />}>
      {shares === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : shares.length === 0 ? (
        <EmptyState className="py-20" icon={<LinkIcon size={24} />} title={t('empty')} />
      ) : (
        <ul className="space-y-2">
          {shares.map(share => {
            const { item, link, uploadLink, people } = share;
            const expired = link?.expiresAt ? new Date(link.expiresAt) <= new Date() : false;
            const usedUp = link?.maxDownloads != null && link.downloads >= link.maxDownloads;
            const uploadExpired = uploadLink?.expiresAt ? new Date(uploadLink.expiresAt) <= new Date() : false;
            const room = uploadLink?.folderLimit != null ? Math.max(0, uploadLink.folderLimit - uploadLink.folderSize) : null;
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 shadow-xs sm:flex-row sm:items-start sm:gap-4 sm:p-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <button type="button" onClick={() => open(item)} tabIndex={-1} aria-hidden="true" className="shrink-0">
                    <FileTile kind={item.kind} mime={item.mime} name={item.name} thumbnail={item.hasThumbnail ? urls.thumbnail(item) : null} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => open(item)} className="block max-w-full text-left">
                      <FileName name={item.name} folder={item.kind === 'folder'} className="text-[15px] font-semibold text-ink hover:underline" />
                    </button>
                    <p className="truncate text-sm text-ink-muted">{share.location || tFiles('title')}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {link ? (
                        <Chip icon={link.access === 'public' ? <Globe size={13} /> : <Lock size={13} />}>
                          {link.access === 'public' ? t('public') : t('users')}
                        </Chip>
                      ) : null}
                      {link?.hasPassword ? <Chip tone="muted" icon={<KeyRound size={13} />}>{t('password')}</Chip> : null}
                      {link?.expiresAt ? (
                        <Chip tone={expired ? 'danger' : 'muted'} icon={<Clock size={13} />}>
                          {expired ? t('expired') : t('expires', { date: formatDate(link.expiresAt, locale) })}
                        </Chip>
                      ) : null}
                      {link ? (
                        <Chip tone={usedUp ? 'danger' : 'muted'} icon={<LinkIcon size={13} />}>
                          {link.maxDownloads != null
                            ? t('downloadsOf', { count: link.downloads, max: link.maxDownloads })
                            : t('downloads', { count: link.downloads })}
                        </Chip>
                      ) : null}
                      {uploadLink ? <Chip icon={<Upload size={13} />}>{t('upload')}</Chip> : null}
                      {uploadLink?.hasPassword ? <Chip tone="muted" icon={<KeyRound size={13} />}>{t('password')}</Chip> : null}
                      {uploadLink?.expiresAt ? (
                        <Chip tone={uploadExpired ? 'danger' : 'muted'} icon={<Clock size={13} />}>
                          {uploadExpired ? t('expired') : t('expires', { date: formatDate(uploadLink.expiresAt, locale) })}
                        </Chip>
                      ) : null}
                      {uploadLink ? (
                        <Chip tone="muted" icon={<Inbox size={13} />}>
                          {t('received', { count: uploadLink.received })}
                        </Chip>
                      ) : null}
                      {uploadLink ? (
                        <Chip tone={room === 0 ? 'danger' : 'muted'} icon={<HardDrive size={13} />}>
                          {room === null
                            ? formatBytes(uploadLink.folderSize, locale)
                            : room === 0
                              ? t('folderFull', { size: formatBytes(uploadLink.folderSize, locale) })
                              : t('folderLeft', { size: formatBytes(uploadLink.folderSize, locale), left: formatBytes(room, locale) })}
                        </Chip>
                      ) : null}
                      {people.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted" title={people.map(person => person.username).join(', ')}>
                          <AvatarStack people={people} />
                          {t('people', { count: people.length })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1 pl-[3.25rem] sm:shrink-0 sm:pl-0">
                  {link ? (
                    <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => void copy(urls.linkPage(link.token))}>
                      {t('copy')}
                    </Button>
                  ) : null}
                  {uploadLink ? (
                    <Button size="sm" variant="outline" icon={<Copy size={15} />} onClick={() => void copy(urls.uploadPage(uploadLink.token))}>
                      {t('copyUpload')}
                    </Button>
                  ) : null}
                  <IconButton label={t('manage', { name: item.name })} icon={<Settings2 size={18} />} onClick={() => setManaging(item)} />
                  <IconButton
                    label={t('stop', { name: item.name })}
                    icon={<Unlink size={18} />}
                    onClick={() => setStopping(share)}
                    className="hover:bg-danger-soft hover:text-danger"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ShareDialog item={managing} onClose={() => setManaging(null)} onChanged={() => void load()} />
      <Confirm
        open={stopping !== null}
        title={t('stopTitle')}
        confirmLabel={t('stopConfirm')}
        danger
        onCancel={() => setStopping(null)}
        onConfirm={() => (stopping ? stop(stopping) : undefined)}
      >
        {stopping ? consequences(stopping) : null}
      </Confirm>
      {viewing ? <Viewer items={[viewing]} index={0} source={appSource} onIndex={() => {}} onClose={() => setViewing(null)} /> : null}
    </PageLayout>
  );
}
