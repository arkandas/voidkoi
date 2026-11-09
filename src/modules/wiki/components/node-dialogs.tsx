'use client';

import { Globe, KeyRound, Layers, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { Button, Confirm, CopyField, Input, Modal, PasswordSetting, Select, Spinner, useToast } from '@/components/ui';
import { api, urls } from '@/modules/wiki/lib/api';
import type { EffectiveVisibility, PageDetail, TreeNodeDto, VisibilityDto } from '@/modules/wiki/lib/api-types';
import { cn } from '@/lib/cn';
import { folderChoices, isInside, pathUnder } from '@/modules/wiki/lib/tree-view';
import { useApiError } from '@/lib/use-api-error';
import { LIMITS } from '@/modules/wiki/lib/validate';

import { useWiki } from './wiki-provider';

/** The dialogs the tree, the pages and the editor open: new, share, settings, delete. */
export function NodeDialogs() {
  const { dialog, closeDialog } = useWiki();
  return (
    <>
      <CreateDialog request={dialog?.kind === 'create' ? dialog : null} onClose={closeDialog} />
      <ShareDialog id={dialog?.kind === 'share' ? dialog.id : null} onClose={closeDialog} />
      <SettingsDialog id={dialog?.kind === 'settings' ? dialog.id : null} onClose={closeDialog} />
      <DeleteDialog id={dialog?.kind === 'delete' ? dialog.id : null} onClose={closeDialog} />
    </>
  );
}

/** The detail of the node a dialog is about, loaded when it opens. */
function useDetail(id: number | null): [PageDetail | null, (detail: PageDetail) => void, boolean] {
  const toast = useToast();
  const apiError = useApiError();
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // Another node: nothing loaded for it yet.
  const [shownFor, setShownFor] = useState(id);
  if (id !== shownFor) {
    setShownFor(id);
    setDetail(null);
    setFailed(false);
  }
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    api
      .node(id)
      .then(loaded => {
        if (!cancelled) setDetail(loaded);
      })
      .catch(error => {
        if (cancelled) return;
        setFailed(true);
        toast.show(apiError(error, 'loadFailed'), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, toast, apiError]);
  return [detail, setDetail, failed];
}

/* New page or folder ---------------------------------------------------------- */

function CreateDialog({ request, onClose }: { request: { nodeKind: 'page' | 'folder'; parentId: number | null } | null; onClose(): void }) {
  const t = useTranslations('wiki.dialogs.create');
  const tCommon = useTranslations('common');
  const { tree, refresh } = useWiki();
  const router = useRouter();
  const apiError = useApiError();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const page = request?.nodeKind !== 'folder';
  const parent = request?.parentId != null ? tree.find(node => node.id === request.parentId) : null;

  // Opened again: from the start.
  const [shownFor, setShownFor] = useState(request);
  if (request !== shownFor) {
    setShownFor(request);
    if (request) {
      setTitle('');
      setError(null);
      setBusy(false);
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!request || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createNode(request.nodeKind, request.parentId, title.trim());
      onClose();
      router.push(page ? urls.edit(created.id) : urls.page(created.path));
      refresh();
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
      setBusy(false);
    }
  };

  const heading = page ? t('page') : t('folder');
  return (
    <Modal open={request !== null} label={heading} title={heading} onClose={busy ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        {parent ? <p className="text-sm text-ink-muted">{t('in', { folder: parent.title })}</p> : null}
        <Input
          label={t('title')}
          autoFocus
          maxLength={LIMITS.title}
          value={title}
          onChange={event => setTitle(event.target.value)}
          error={error}
        />
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {page ? t('createPage') : t('createFolder')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* Share: who can read it ---------------------------------------------------------- */

const VISIBILITY_ICONS: Record<VisibilityDto, typeof Globe> = {
  inherit: Layers,
  public: Globe,
  private: Lock,
  password: KeyRound,
};

function ShareDialog({ id, onClose }: { id: number | null; onClose(): void }) {
  const t = useTranslations('wiki.dialogs.share');
  const tCommon = useTranslations('common');
  const { name, refresh } = useWiki();
  const [detail, setDetail, failed] = useDetail(id);
  const title = detail ? detail.title || t('untitled') : '';
  const heading = detail ? t('title', { title }) : t('loading');

  return (
    <Modal open={id !== null} size="lg" label={heading} title={heading} onClose={onClose}>
      {detail ? (
        <div className="space-y-7">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('link')}</h3>
            <CopyField value={`${window.location.origin}${urls.page(detail.path)}`} label={t('link')} />
          </section>
          <VisibilitySection
            detail={detail}
            wikiName={name}
            onSaved={saved => {
              setDetail(saved);
              refresh();
            }}
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {tCommon('done')}
            </Button>
          </div>
        </div>
      ) : failed ? null : (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </Modal>
  );
}

function VisibilitySection({ detail, wikiName, onSaved }: { detail: PageDetail; wikiName: string; onSaved(detail: PageDetail): void }) {
  const t = useTranslations('wiki.dialogs.share');
  const tVisibility = useTranslations('wiki.visibility');
  const toast = useToast();
  const apiError = useApiError();
  const [choice, setChoice] = useState<VisibilityDto>(detail.visibility);
  const [password, setPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved, or another node: start from what it has.
  const [shownFor, setShownFor] = useState(detail);
  if (detail !== shownFor) {
    setShownFor(detail);
    setChoice(detail.visibility);
    setPassword('');
    setChangingPassword(false);
    setError(null);
  }

  // What Inherit comes to: the folder's setting, or the wiki's.
  const inherited: EffectiveVisibility = detail.visibility === 'inherit' ? detail.effective : detail.inherits;
  const source = detail.inheritedFrom ?? wikiName;
  const hasPassword = detail.visibility === 'password' && detail.hasPassword;
  const needsPassword = choice === 'password' && (!hasPassword || changingPassword);
  const changed = choice !== detail.visibility || (choice === 'password' && password !== '');

  const save = async (): Promise<void> => {
    if (needsPassword && !password) {
      setError(t('passwordMissing'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateNode(detail.id, { visibility: choice, ...(password ? { password } : {}) });
      onSaved(saved);
      toast.show(t('saved'), 'success');
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const options: VisibilityDto[] = ['inherit', 'public', 'private', 'password'];
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-ink">{t('who')}</h3>
      <div role="radiogroup" aria-label={t('who')} className="overflow-hidden rounded-xl border border-line">
        {options.map(option => {
          const Icon = VISIBILITY_ICONS[option];
          const selected = choice === option;
          return (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0',
                selected ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={option}
                checked={selected}
                onChange={() => {
                  setChoice(option);
                  setError(null);
                }}
                className="sr-only"
              />
              <Icon
                size={18}
                aria-hidden="true"
                className={cn(
                  'shrink-0',
                  option === 'public' ? 'text-success' : option === 'password' ? 'text-warning' : selected ? 'text-accent' : 'text-ink-muted',
                )}
              />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
                {option === 'inherit' ? t('inherit', { source }) : tVisibility(option)}
              </span>
              {option === 'inherit' ? <span className="shrink-0 text-sm text-ink-muted">{tVisibility(inherited)}</span> : null}
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-accent' : 'border-line-strong',
                )}
              >
                {selected ? <span className="size-2.5 rounded-full bg-accent" /> : null}
              </span>
            </label>
          );
        })}
      </div>

      {choice === 'password' ? (
        <PasswordSetting
          className="mt-3"
          hasPassword={hasPassword}
          changing={changingPassword}
          onChanging={() => setChangingPassword(true)}
          value={password}
          onValue={setPassword}
          label={t('passwordNew')}
          maxLength={LIMITS.password}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {changed ? (
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {t('save')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/* Settings: title, address, folder --------------------------------------------- */

function SettingsDialog({ id, onClose }: { id: number | null; onClose(): void }) {
  const t = useTranslations('wiki.dialogs.settings');
  const { refresh } = useWiki();
  const [detail] = useDetail(id);
  const heading = detail ? t(detail.kind === 'folder' ? 'folderTitle' : 'pageTitle', { title: detail.title || t('untitled') }) : t('loading');
  return (
    <Modal open={id !== null} label={heading} title={heading} onClose={onClose}>
      {detail ? (
        <SettingsForm detail={detail} onClose={onClose} onSaved={refresh} />
      ) : (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </Modal>
  );
}

function SettingsForm({ detail, onClose, onSaved }: { detail: PageDetail; onClose(): void; onSaved(): void }) {
  const t = useTranslations('wiki.dialogs.settings');
  const tCommon = useTranslations('common');
  const { tree } = useWiki();
  const router = useRouter();
  const pathname = usePathname();
  const apiError = useApiError();
  const [title, setTitle] = useState(detail.title);
  const [slug, setSlug] = useState(detail.slug);
  const [parentId, setParentId] = useState<number | null>(detail.parentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const folders = useMemo(
    () => folderChoices(tree).filter(choice => !isInside(tree as TreeNodeDto[], choice.id, detail.id)),
    [tree, detail.id],
  );
  const parentPath = parentId === null ? '' : `${tree.find(node => node.id === parentId)?.path ?? ''}/`;
  const changed = (detail.kind === 'folder' && title.trim() !== detail.title) || slug !== detail.slug || parentId !== detail.parentId;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const changes: { title?: string; slug?: string } = {};
      if (detail.kind === 'folder' && title.trim() !== detail.title) changes.title = title.trim();
      if (slug !== detail.slug) changes.slug = slug;
      let saved = detail;
      if (Object.keys(changes).length) saved = await api.updateNode(detail.id, changes);
      if (parentId !== detail.parentId) {
        await api.moveNode(detail.id, parentId, 1_000_000);
        saved = await api.node(detail.id);
      }
      onClose();
      onSaved();
      // The page on show moved: follow it to its new address.
      const showing = pathUnder(pathname, '/wiki') ?? '';
      if (showing === detail.path && saved.path !== detail.path) router.replace(urls.page(saved.path));
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {detail.kind === 'folder' ? (
        <Input label={t('title')} value={title} maxLength={LIMITS.title} onChange={event => setTitle(event.target.value)} />
      ) : null}
      <div>
        <label htmlFor="node-slug" className="mb-1.5 block text-sm font-medium text-ink-muted">
          {t('address')}
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-line-strong bg-raised focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <span className="flex max-w-[55%] items-center truncate border-r border-line bg-muted px-3 font-mono text-[13px] text-ink-muted dark:bg-canvas">
            /{parentPath}
          </span>
          <input
            id="node-slug"
            value={slug}
            maxLength={LIMITS.slug}
            spellCheck={false}
            autoCapitalize="none"
            onChange={event => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-ink outline-hidden"
          />
        </div>
      </div>
      <Select
        label={t('folder')}
        value={parentId === null ? '' : String(parentId)}
        onChange={event => setParentId(event.target.value ? Number(event.target.value) : null)}
        options={[{ value: '', label: t('topLevel') }, ...folders.map(choice => ({ value: String(choice.id), label: choice.label }))]}
      />
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" disabled={busy || !changed || !slug || (detail.kind === 'folder' && !title.trim())}>
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}

/* Delete ------------------------------------------------------------------------ */

function DeleteDialog({ id, onClose }: { id: number | null; onClose(): void }) {
  const t = useTranslations('wiki.dialogs.delete');
  const { tree, refresh } = useWiki();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const apiError = useApiError();
  const node = id === null ? null : tree.find(each => each.id === id) ?? null;
  const inside = node ? tree.filter(each => each.id !== node.id && isInside(tree, each.id, node.id)).length : 0;

  const confirm = async (): Promise<void> => {
    if (!node) return;
    try {
      await api.trashNode(node.id);
      onClose();
      const showing = pathUnder(pathname, '/wiki') ?? '';
      const gone =
        showing === node.path ||
        showing.startsWith(`${node.path}/`) ||
        new RegExp(`^(edit|history)/${node.id}$`).test(showing);
      if (gone) router.replace('/wiki');
      refresh();
      toast.show(t('done', { title: node.title }), 'success', {
        label: t('undo'),
        run: () => {
          void api
            .restore(node.id)
            .then(() => refresh())
            .catch(error => toast.show(apiError(error, 'restoreFailed'), 'error'));
        },
      });
    } catch (caught) {
      toast.show(apiError(caught, 'deleteFailed'), 'error');
    }
  };

  const body: ReactNode = node
    ? node.kind === 'folder' && inside > 0
      ? t('folderBody', { title: node.title, count: inside })
      : t('body', { title: node.title || t('untitled') })
    : null;

  return (
    <Confirm open={id !== null && node !== null} title={t('title')} confirmLabel={t('confirm')} danger onCancel={onClose} onConfirm={confirm}>
      {body}
    </Confirm>
  );
}
