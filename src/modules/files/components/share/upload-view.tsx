'use client';

import { Clock, Folder, Unlink, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';

import { AuthSpinner } from '@/components/layout/auth-card';
import { LinkShell, Notice, PasswordForm } from '@/modules/files/components/share/link-page';
import { DropOverlay } from '@/modules/files/components/upload/drop-overlay';
import { UploadPanel } from '@/modules/files/components/upload/upload-panel';
import { Avatar, Button } from '@/components/ui';
import { api } from '@/modules/files/lib/api';
import type { PublicUploadLink } from '@/modules/files/lib/api-types';
import { ApiError } from '@/lib/error-codes';
import { formatDateTime } from '@/lib/format';
import { fromFileList, type Picked } from '@/modules/files/lib/upload/collect';
import { UploadManager, type Target } from '@/modules/files/lib/upload/engine';

/**
 * An upload link's page: whose folder files go to and its name, a place to
 * drop them, and their progress. What is already in the folder never shows.
 */
export function UploadView({ token }: { token: string }) {
  const t = useTranslations('files.uploadLink');
  const tLink = useTranslations('files.link');
  const locale = useLocale();
  const [link, setLink] = useState<PublicUploadLink | null>(null);
  const [failed, setFailed] = useState(false);
  const manager = useMemo(() => new UploadManager(`/api/files/u/${token}`), [token]);
  const { uploads } = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLink(await api.publicUploadLink(token));
      setFailed(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) setFailed(true);
      else setLink({ state: 'notFound' });
    }
  }, [token]);

  // The first look. The state is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.publicUploadLink(token).then(
      found => {
        if (cancelled) return;
        setLink(found);
        setFailed(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 0) setFailed(true);
        else setLink({ state: 'notFound' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (link?.state === 'ok') manager.setLimits({ maxUploadBytes: link.maxUploadBytes, directMax: link.chunkSize });
  }, [manager, link]);

  const target = useMemo<Target | null>(() => (link?.state === 'ok' ? { id: null, label: link.folder } : null), [link]);
  // Through a link nothing is replaced: a name already taken gets a number.
  const send = useCallback((picked: Picked, destination: Target) => void manager.add(picked, destination), [manager]);

  const onPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const list = event.target.files;
    if (list && list.length > 0 && target) send(fromFileList(list), target);
    event.target.value = '';
  };

  if (failed) {
    return (
      <Notice icon={<Unlink size={24} />} title={tLink('offline')}>
        <Button fullWidth onClick={() => void load()}>
          {tLink('retry')}
        </Button>
      </Notice>
    );
  }
  if (!link) return <AuthSpinner />;
  if (link.state === 'notFound') return <Notice icon={<Unlink size={24} />} title={tLink('notFound.title')} body={tLink('notFound.body')} />;
  if (link.state === 'expired') return <Notice icon={<Clock size={24} />} title={tLink('expired.title')} body={tLink('expired.body')} />;
  if (link.state === 'password') {
    return (
      <PasswordForm
        body={t('passwordBody', { name: link.owner })}
        unlock={password => api.unlockUploadLink(token, password)}
        onUnlocked={() => void load()}
      />
    );
  }
  if (link.state !== 'ok') return null;

  return (
    <LinkShell width="md">
      <div className="px-5 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar person={link.owner} size="md" uploadLink={token} />
          <div className="min-w-0">
            <h1 className="text-lg leading-snug font-semibold text-ink">{t('title', { name: link.owner.username })}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <Folder size={14} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{link.folder}</span>
              </span>
              {link.expiresAt ? (
                <span className="text-ink-faint">{tLink('until', { date: formatDateTime(link.expiresAt, locale) })}</span>
              ) : null}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={t('choose')}
          onClick={() => input.current?.click()}
          className="group mt-6 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong bg-raised px-6 py-9 text-center transition-colors hover:border-accent focus:outline-hidden focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/25 dark:bg-card"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent transition-transform duration-200 group-hover:-translate-y-0.5">
            <Upload size={26} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="hidden text-base font-semibold text-ink pointer-fine:block">{t('drop')}</span>
          <span className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors group-hover:bg-accent-hover">
            {t('choose')}
          </span>
        </button>
        <input ref={input} type="file" multiple tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onPicked} />

        {uploads.length > 0 ? (
          <UploadPanel manager={manager} maxUploadBytes={link.maxUploadBytes} floating={false} className="mt-5" />
        ) : null}
      </div>
      <DropOverlay target={target} onDrop={send} />
    </LinkShell>
  );
}
