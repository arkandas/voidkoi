'use client';

import { Globe, Link as LinkIcon, Lock, Search, Trash, Upload, Users, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { LinkAddress, LockSettings, Problem, lockChanged, lockChanges, lockDraftFrom, type LockDraft } from '@/modules/files/components/share/link-fields';
import { QrDialog } from '@/modules/files/components/share/qr-dialog';
import { Avatar, Button, IconButton, Modal, Segmented, Spinner, Switch, fieldClasses, useToast } from '@/components/ui';
import { api, urls, type LinkChanges } from '@/modules/files/lib/api';
import type { ItemDto, LinkAccessDto, LinkDto, PersonDto, ShareInfo, UploadLinkDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/error-codes';
import { formatBytes } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';

export interface ShareDialogProps {
  item: ItemDto | null;
  onClose(): void;
  /** Something about how it is shared changed: listings should show it. */
  onChanged(): void;
}

/** The share link's form: who can open it, its password and expiry date, and its download limit. */
interface Draft extends LockDraft {
  access: LinkAccessDto;
  useLimit: boolean;
  limit: string;
}

function draftFrom(link: LinkDto | null): Draft {
  return {
    ...lockDraftFrom(link),
    access: link?.access ?? 'public',
    useLimit: link?.maxDownloads != null,
    limit: link?.maxDownloads != null ? String(link.maxDownloads) : '10',
  };
}

/** Which part of the dialog a change came from: only its form starts over. */
type Part = 'link' | 'upload' | 'people';

function SectionTitle({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 text-ink-muted [&_svg]:size-[17px]">{icon}</span>
      <h3 id={id} className="font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

/** How much a folder with an upload link holds, and, under the administrator's limit, how much room is left. */
function FolderMeter({ link }: { link: UploadLinkDto }) {
  const t = useTranslations('files.share');
  const locale = useLocale();
  const used = formatBytes(link.folderSize, locale);
  const limit = link.folderLimit;
  const left = limit === null ? null : Math.max(0, limit - link.folderSize);
  const fraction = limit ? Math.min(1, link.folderSize / limit) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
        <span className="font-medium text-ink">{t('folderSize')}</span>
        <span className="truncate text-ink-muted">
          {limit !== null
            ? t.rich('folderUsedOf', { used, limit: formatBytes(limit, locale), b: chunks => <b className="font-semibold text-ink">{chunks}</b> })
            : <b className="font-semibold text-ink">{used}</b>}
        </span>
      </div>
      {fraction !== null && left !== null ? (
        <>
          <div
            role="progressbar"
            aria-label={t('folderSize')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-canvas"
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', fraction > 0.9 ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${Math.max(fraction > 0 ? 2 : 0, fraction * 100)}%` }}
            />
          </div>
          <p className={cn('mt-2 text-sm tabular-nums', left === 0 ? 'font-medium text-danger' : 'text-ink-muted')}>
            {left === 0 ? t('folderFull') : t('folderLeft', { left: formatBytes(left, locale) })}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * Share with a link, with people who have an account here, or both. The link
 * is public or only for people who sign in, and can carry a password, an
 * expiry date and a download limit. A folder can also get an upload link,
 * through which people without an account put files in it.
 */
export function ShareDialog({ item, onClose, onChanged }: ShareDialogProps) {
  const t = useTranslations('files.share');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const apiError = useApiError();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [everyone, setEveryone] = useState<PersonDto[]>([]);
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [uploadDraft, setUploadDraft] = useState<LockDraft>(lockDraftFrom(null));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [qr, setQr] = useState<{ url: string; fileName: string } | null>(null);
  const [shown, setShown] = useState(item);
  const open = item !== null;

  // Opened for another item: start over while its sharing loads.
  if (item !== shown) {
    setShown(item);
    if (item) {
      setInfo(null);
      setError(null);
      setQuery('');
      setQr(null);
    }
  }

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    Promise.all([api.shareInfo(item.id), api.people()])
      .then(([loaded, people]) => {
        if (cancelled) return;
        setInfo(loaded);
        setEveryone(people);
        setDraft(draftFrom(loaded.link));
        setUploadDraft(lockDraftFrom(loaded.uploadLink));
      })
      .catch(caught => {
        if (!cancelled) setError(apiError(caught, 'loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [item, apiError]);

  const link = info?.link ?? null;
  const uploadLink = info?.uploadLink ?? null;
  const update = (changes: Partial<Draft>) => setDraft(current => ({ ...current, ...changes }));
  const updateUpload = (changes: Partial<LockDraft>) => setUploadDraft(current => ({ ...current, ...changes }));

  const dirty = useMemo(() => {
    if (!link) return false;
    const before = draftFrom(link);
    return (
      draft.access !== before.access ||
      lockChanged(draft, before) ||
      draft.useLimit !== before.useLimit ||
      (draft.useLimit && draft.limit !== before.limit)
    );
  }, [draft, link]);

  const uploadDirty = useMemo(
    () => (uploadLink ? lockChanged(uploadDraft, lockDraftFrom(uploadLink)) : false),
    [uploadDraft, uploadLink],
  );

  const applied = (next: ShareInfo, part: Part, message?: string) => {
    setInfo(next);
    if (part === 'link') setDraft(draftFrom(next.link));
    if (part === 'upload') setUploadDraft(lockDraftFrom(next.uploadLink));
    onChanged();
    if (message) toast.show(message, 'success');
  };

  const run = async (work: () => Promise<void>): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Problem && !(caught instanceof ApiError) ? caught.message : apiError(caught, 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const createLink = () =>
    run(async () => {
      applied(await api.saveLink(item!.id, { access: draft.access, expiresAt: null, maxDownloads: null }), 'link', t('linkCreated'));
    });

  const saveLink = () =>
    run(async () => {
      const lock = lockChanges(draft, link?.hasPassword ?? false, t('passwordMissing'));
      const limit = Number(draft.limit);
      if (draft.useLimit && (!Number.isInteger(limit) || limit < 1)) throw new Problem(t('limitInvalid'));
      const changes: LinkChanges = { access: draft.access, ...lock, maxDownloads: draft.useLimit ? limit : null };
      applied(await api.saveLink(item!.id, changes), 'link', t('linkSaved'));
    });

  const deleteLink = () =>
    run(async () => {
      applied(await api.deleteLink(item!.id), 'link', t('linkDeleted'));
    });

  const createUploadLink = () =>
    run(async () => {
      applied(await api.saveUploadLink(item!.id, { expiresAt: null }), 'upload', t('uploadCreated'));
    });

  const saveUploadLink = () =>
    run(async () => {
      const changes = lockChanges(uploadDraft, uploadLink?.hasPassword ?? false, t('passwordMissing'));
      applied(await api.saveUploadLink(item!.id, changes), 'upload', t('uploadSaved'));
    });

  const deleteUploadLink = () =>
    run(async () => {
      applied(await api.deleteUploadLink(item!.id), 'upload', t('uploadDeleted'));
    });

  const setPeople = (ids: number[]) =>
    run(async () => {
      applied(await api.setPeople(item!.id, ids), 'people');
    });

  const chosen = new Set(info?.people.map(person => person.id) ?? []);
  const matches = everyone
    .filter(person => !chosen.has(person.id))
    .filter(person => person.username.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 6);

  const title = item ? t('title', { name: item.name }) : '';
  const access = [
    { value: 'public' as const, label: t('anyone'), icon: Globe },
    { value: 'users' as const, label: t('signedIn'), icon: Lock },
  ];

  return (
    <Modal open={open} size="lg" label={title} title={title} onClose={saving ? undefined : onClose} dismissible={!saving}>
      {!info && !error ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="share-link" className="space-y-4">
            <SectionTitle id="share-link" icon={<LinkIcon size={18} aria-hidden="true" />} title={t('linkTitle')} />

            <div>
              <Segmented<LinkAccessDto> ariaLabel={t('access')} value={draft.access} onChange={value => update({ access: value })} options={access} />
            </div>

            {link ? (
              <>
                <LinkAddress
                  url={urls.linkPage(link.token)}
                  label={t('address')}
                  onQr={() => setQr({ url: urls.linkPage(link.token), fileName: t('qrFile', { name: item!.name }) })}
                />

                <div className="space-y-4 rounded-xl border border-line bg-raised p-4 dark:bg-card">
                  <LockSettings draft={draft} hasPassword={link.hasPassword} update={update} />

                  <div className="h-px bg-line" />

                  <Switch
                    label={t('limit')}
                    description={t('downloads', { count: link.downloads })}
                    checked={draft.useLimit}
                    onChange={checked => update({ useLimit: checked })}
                  />
                  {draft.useLimit ? (
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        aria-label={t('limit')}
                        value={draft.limit}
                        onChange={event => update({ limit: event.target.value })}
                        className={cn(fieldClasses, 'h-10 w-32 px-3.5 text-sm')}
                      />
                      <span className="text-sm text-ink-muted">{t('limitUnit')}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" icon={<Trash size={16} />} onClick={() => void deleteLink()} disabled={saving} className="text-danger hover:bg-danger-soft">
                    {t('deleteLink')}
                  </Button>
                  <Button onClick={() => void saveLink()} disabled={saving || !dirty}>
                    {t('save')}
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={() => void createLink()} disabled={saving} icon={<LinkIcon size={16} />}>
                {t('create')}
              </Button>
            )}
          </section>

          {item?.kind === 'folder' ? (
            <>
              <div className="h-px bg-line" />

              <section aria-labelledby="share-upload" className="space-y-4">
                <SectionTitle id="share-upload" icon={<Upload size={18} aria-hidden="true" />} title={t('uploadTitle')}>
                  {uploadLink ? (
                    <span className="ml-auto text-sm text-ink-muted tabular-nums">{t('received', { count: uploadLink.received })}</span>
                  ) : null}
                </SectionTitle>

                {uploadLink ? (
                  <>
                    <LinkAddress
                      url={urls.uploadPage(uploadLink.token)}
                      label={t('uploadAddress')}
                      onQr={() => setQr({ url: urls.uploadPage(uploadLink.token), fileName: t('qrUploadFile', { name: item.name }) })}
                    />

                    <div className="space-y-4 rounded-xl border border-line bg-raised p-4 dark:bg-card">
                      <FolderMeter link={uploadLink} />
                      <div className="h-px bg-line" />
                      <LockSettings draft={uploadDraft} hasPassword={uploadLink.hasPassword} update={updateUpload} />
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        variant="ghost"
                        icon={<Trash size={16} />}
                        onClick={() => void deleteUploadLink()}
                        disabled={saving}
                        className="text-danger hover:bg-danger-soft"
                      >
                        {t('uploadDelete')}
                      </Button>
                      <Button onClick={() => void saveUploadLink()} disabled={saving || !uploadDirty}>
                        {t('save')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => void createUploadLink()} disabled={saving} icon={<Upload size={16} />}>
                    {t('uploadCreate')}
                  </Button>
                )}
              </section>
            </>
          ) : null}

          <div className="h-px bg-line" />

          <section aria-labelledby="share-people" className="space-y-4">
            <SectionTitle id="share-people" icon={<Users size={18} aria-hidden="true" />} title={t('peopleTitle')} />

            {everyone.length === 0 ? (
              <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-ink-muted dark:bg-canvas">{t('nobody')}</p>
            ) : (
              <div className="relative">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-3 left-3 text-ink-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={t('addPeople')}
                  aria-label={t('addPeople')}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && matches[0]) {
                      event.preventDefault();
                      void setPeople([...chosen, matches[0].id]);
                      setQuery('');
                    }
                  }}
                  className={cn(fieldClasses, 'h-10 pr-3 pl-9 text-sm')}
                />
                {query.trim() && matches.length > 0 ? (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line-strong bg-raised p-1 shadow-xl dark:bg-surface">
                    {matches.map(person => (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void setPeople([...chosen, person.id]);
                            setQuery('');
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink hover:bg-muted"
                        >
                          <Avatar person={person} size="sm" />
                          {person.username}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!query.trim() && matches.length > 0 && info?.people.length === 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {matches.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => void setPeople([...chosen, person.id])}
                        className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-3 pl-1 text-sm text-ink-muted transition-colors hover:border-accent hover:text-ink"
                      >
                        <Avatar person={person} size="xs" />
                        {person.username}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {info && info.people.length > 0 ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {info.people.map(person => (
                  <li key={person.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar person={person} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{person.username}</span>
                    <IconButton
                      size="sm"
                      label={t('removePerson', { name: person.username })}
                      icon={<X size={16} />}
                      onClick={() => void setPeople([...chosen].filter(id => id !== person.id))}
                      disabled={saving}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {tCommon('done')}
            </Button>
          </div>
        </div>
      )}
      <QrDialog url={qr?.url ?? null} fileName={qr?.fileName ?? ''} onClose={() => setQr(null)} />
    </Modal>
  );
}
