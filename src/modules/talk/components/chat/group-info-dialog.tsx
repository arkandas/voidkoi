'use client';

import { ArrowLeft, Camera, LogOut, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type FormEvent } from 'react';

import { AvatarEditor } from '@/components/settings/avatar-editor';
import { Alert, Badge, Button, IconButton, Input, Modal } from '@/components/ui';
import { GroupAvatar, PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { api, urls } from '@/modules/talk/lib/api';
import { activeMembers, isOwner } from '@/modules/talk/lib/groups';
import {
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  validateGroupName,
  type ConversationSummary,
  type DirectoryUser,
  type GroupInfo,
  type GroupMember,
  type UserStatus,
} from '@/modules/talk/lib/protocol';

import { PeoplePicker } from './people-picker';

export interface GroupInfoDialogProps {
  conversationId: number;
  group: GroupInfo;
  viewerId: number;
  statusOf(userId: number): UserStatus;
  onClose(): void;
  /** Renamed, or people added or removed: here is the group as it is now. */
  onChanged(conversation: ConversationSummary): void;
  onLeave(): void;
  onDeleteGroup(): void;
  /** Only once you are no longer in it. */
  onDeleteChat(): void;
}

/**
 * Everything about a group in one place: its name, who is in it, and the ways
 * out. The owner can rename it and add and remove people here.
 */
export function GroupInfoDialog({ conversationId, group, viewerId, statusOf, onClose, onChanged, onLeave, onDeleteGroup, onDeleteChat }: GroupInfoDialogProps) {
  const t = useTranslations('talk.chat.group.info');
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <AddPeople
        conversationId={conversationId}
        group={group}
        viewerId={viewerId}
        statusOf={statusOf}
        onBack={() => setAdding(false)}
        onClose={onClose}
        onAdded={conversation => {
          onChanged(conversation);
          setAdding(false);
        }}
      />
    );
  }

  const owner = isOwner(group, viewerId);
  const members = activeMembers(group);

  return (
    <Modal open size="md" label={t('label', { name: group.name })} title={t('title')} onClose={onClose}>
      <GroupName conversationId={conversationId} group={group} editable={owner} onRenamed={onChanged} />

      {group.active ? null : (
        <Alert tone="info" className="mt-4">
          {t('inactive')}
        </Alert>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-muted">{t('members', { count: members.length })}</h3>
        {owner ? (
          <Button variant="outline" size="sm" icon={<UserPlus size={16} />} onClick={() => setAdding(true)} disabled={members.length >= GROUP_MEMBERS_MAX}>
            {t('addPeople')}
          </Button>
        ) : null}
      </div>

      <ul aria-label={t('membersLabel')} className="-mx-2 mt-2 flex flex-col gap-0.5">
        {members.map(member => (
          <MemberRow
            key={member.id}
            conversationId={conversationId}
            member={member}
            you={member.id === viewerId}
            isGroupOwner={member.id === group.ownerId}
            removable={owner && member.id !== viewerId}
            status={statusOf(member.id)}
            onRemoved={onChanged}
          />
        ))}
      </ul>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {group.active ? (
          <Button variant="outline" icon={<LogOut size={16} />} onClick={onLeave}>
            {t('leave')}
          </Button>
        ) : (
          <Button variant="destructive" icon={<Trash2 size={16} />} onClick={onDeleteChat}>
            {t('deleteChat')}
          </Button>
        )}
        {owner ? (
          <Button variant="destructive" icon={<Trash2 size={16} />} onClick={onDeleteGroup}>
            {t('deleteGroup')}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

/** The name, and for the owner a pencil that turns it into a field in place. */
function GroupName({
  conversationId,
  group,
  editable,
  onRenamed,
}: {
  conversationId: number;
  group: GroupInfo;
  editable: boolean;
  onRenamed(conversation: ConversationSummary): void;
}) {
  const t = useTranslations('talk.chat.group.info');
  const tValidation = useTranslations('talk.validation');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (draft === null || saving) return;
    const issue = validateGroupName(draft);
    if (issue) {
      setError(tValidation(issue.key, issue.values ?? {}));
      return;
    }
    // Nothing changed: nothing to tell everybody about.
    if (draft.trim() === group.name) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { conversation } = await api.renameGroup(conversationId, draft.trim());
      onRenamed(conversation);
      setDraft(null);
    } catch {
      setError(t('renameFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (draft !== null) {
    return (
      <form onSubmit={event => void save(event)} noValidate className="flex flex-col gap-3">
        <Input
          label={t('nameLabel')}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          maxLength={GROUP_NAME_MAX}
          autoComplete="off"
          autoFocus
          error={error}
          onKeyDown={event => {
            // Escape backs out of the edit, not out of the whole dialog.
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
              setError(null);
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
            disabled={saving}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <GroupPhoto conversationId={conversationId} group={group} editable={editable} onChanged={onRenamed} />
      <p className="min-w-0 flex-1 text-lg font-semibold break-words text-ink">{group.name}</p>
      {editable ? <IconButton label={t('rename')} onClick={() => setDraft(group.name)} icon={<Pencil size={17} />} /> : null}
    </div>
  );
}

/** The group's photo, and for the owner a way to change it: the suite's crop editor, as for a profile picture. */
function GroupPhoto({
  conversationId,
  group,
  editable,
  onChanged,
}: {
  conversationId: number;
  group: GroupInfo;
  editable: boolean;
  onChanged(conversation: ConversationSummary): void;
}) {
  const t = useTranslations('talk.chat.group.info');
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const photo = <GroupAvatar size="xl" photoUrl={urls.groupPhoto(conversationId, group.photoVersion)} />;

  if (!editable) return photo;

  const run = async (change: () => Promise<{ conversation: ConversationSummary }>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const { conversation } = await change();
      setPending(null);
      onChanged(conversation);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {photo}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        aria-label={t('photoChoose')}
        className="sr-only"
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          // Cleared at once, so choosing the same file twice still opens the editor.
          event.target.value = '';
          if (file) setPending(file);
        }}
      />
      <div className="flex items-center gap-0.5">
        <IconButton
          size="sm"
          label={busy ? t('photoWorking') : group.photoVersion ? t('photoChange') : t('photoSet')}
          disabled={busy}
          onClick={() => input.current?.click()}
          icon={<Camera size={15} />}
        />
        {group.photoVersion ? (
          <IconButton size="sm" label={t('photoRemove')} disabled={busy} onClick={() => void run(() => api.removeGroupPhoto(conversationId))} icon={<Trash2 size={15} />} />
        ) : null}
      </div>
      {failed ? <p className="text-xs text-danger">{t('photoFailed')}</p> : null}
      <AvatarEditor file={pending} onCancel={() => setPending(null)} onConfirm={prepared => run(() => api.setGroupPhoto(conversationId, prepared.image))} />
    </div>
  );
}

/** One person in the group, and for the owner a way to take them out, asked in place. */
function MemberRow({
  conversationId,
  member,
  you,
  isGroupOwner,
  removable,
  status,
  onRemoved,
}: {
  conversationId: number;
  member: GroupMember;
  you: boolean;
  isGroupOwner: boolean;
  removable: boolean;
  status: UserStatus;
  onRemoved(conversation: ConversationSummary): void;
}) {
  const t = useTranslations('talk.chat.group.info');
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async (): Promise<void> => {
    setRemoving(true);
    setFailed(false);
    try {
      const { conversation } = await api.removeGroupMember(conversationId, member.id);
      onRemoved(conversation);
    } catch {
      setFailed(true);
      setRemoving(false);
    }
  };

  return (
    <li className="rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-3">
        <PersonAvatar person={member} size="sm" status={status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {member.displayName}
            {you ? <span className="ml-1 font-normal text-ink-muted">{t('you')}</span> : null}
          </span>
          <span className="block truncate text-xs text-ink-muted">@{member.username}</span>
        </span>
        {isGroupOwner ? <Badge tone="neutral">{t('owner')}</Badge> : null}
        {removable && !confirming ? (
          <IconButton
            size="sm"
            label={t('remove', { name: member.displayName })}
            onClick={() => setConfirming(true)}
            icon={<UserMinus size={16} />}
            className="hover:bg-danger-soft hover:text-danger"
          />
        ) : null}
      </div>
      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-danger-soft px-3 py-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-danger">
            {failed ? t('removeFailed', { name: member.displayName }) : t('removeConfirm', { name: member.displayName })}
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={removing}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={removing}>
            {t('removeAction')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** The owner's picker: everybody not already in the group. */
function AddPeople({
  conversationId,
  group,
  viewerId,
  statusOf,
  onBack,
  onClose,
  onAdded,
}: {
  conversationId: number;
  group: GroupInfo;
  viewerId: number;
  statusOf(userId: number): UserStatus;
  onBack(): void;
  onClose(): void;
  onAdded(conversation: ConversationSummary): void;
}) {
  const t = useTranslations('talk.chat.group');
  const members = activeMembers(group);
  // Former members can come back; only the people in it now are left out.
  const exclude = useMemo(() => new Set(activeMembers(group).map(member => member.id)), [group]);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const full = members.length + chosen.size >= GROUP_MEMBERS_MAX;

  const toggle = (user: DirectoryUser): void => {
    setChosen(current => {
      const next = new Set(current);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      return next;
    });
  };

  const add = async (): Promise<void> => {
    if (chosen.size === 0 || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const { conversation } = await api.addGroupMembers(conversationId, [...chosen]);
      onAdded(conversation);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Modal open size="md" label={t('info.addTitle')} title={t('info.addTitle')} onClose={saving ? undefined : onClose} dismissible={!saving}>
      <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} disabled={saving} className="-mt-1 -ml-3 text-ink-muted">
        {t('create.back')}
      </Button>

      {full ? <p className="mt-2 text-xs text-ink-faint">{t('create.limit', { max: GROUP_MEMBERS_MAX })}</p> : null}

      <PeoplePicker
        meId={viewerId}
        statusOf={statusOf}
        exclude={exclude}
        chosen={chosen}
        onToggle={toggle}
        full={full}
        emptyDescription={t('info.noOneToAdd')}
      />

      {failed ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {t('info.addFailed')}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          {t('info.cancel')}
        </Button>
        <Button icon={<UserPlus size={16} />} onClick={() => void add()} disabled={saving || chosen.size === 0}>
          {saving ? t('info.adding') : t('info.add', { count: chosen.size })}
        </Button>
      </div>
    </Modal>
  );
}
