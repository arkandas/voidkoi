'use client';

import { ArrowLeft, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, Input, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { api } from '@/modules/talk/lib/api';
import { GROUP_MEMBERS_MAX, GROUP_NAME_MAX, validateGroupName, type ConversationSummary, type DirectoryUser, type UserStatus } from '@/modules/talk/lib/protocol';

import { PeoplePicker } from './people-picker';

export interface NewChatDialogProps {
  onClose(): void;
  onPick(user: DirectoryUser): void;
  /** A group was made: open it. */
  onGroupCreated(conversation: ConversationSummary): void;
  /** You, so the list doesn't offer a conversation with yourself. */
  meId: number;
  statusOf(userId: number): UserStatus;
}

/** Pick somebody to talk to, or several people and a name for a group. Mounted only while open, so it always starts fresh. */
export function NewChatDialog({ onClose, onPick, onGroupCreated, meId, statusOf }: NewChatDialogProps) {
  const t = useTranslations('talk.chat');
  const [makingGroup, setMakingGroup] = useState(false);

  if (makingGroup) {
    return <NewGroup meId={meId} statusOf={statusOf} onBack={() => setMakingGroup(false)} onClose={onClose} onCreated={onGroupCreated} />;
  }

  return (
    <Modal open size="md" label={t('newChat.label')} title={t('newChat.title')} onClose={onClose}>
      <button
        type="button"
        onClick={() => setMakingGroup(true)}
        className={cn(
          '-mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
          'hover:bg-muted focus:outline-hidden focus-visible:bg-muted',
        )}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent dark:bg-card">
          <UsersRound size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{t('group.newGroup')}</span>
        </span>
      </button>

      <PeoplePicker meId={meId} statusOf={statusOf} onPick={onPick} />
    </Modal>
  );
}

/** The group half of the dialog: a name, and the people in it. Its own modal, so its title says what it is. */
function NewGroup({
  meId,
  statusOf,
  onBack,
  onClose,
  onCreated,
}: {
  meId: number;
  statusOf(userId: number): UserStatus;
  onBack(): void;
  onClose(): void;
  onCreated(conversation: ConversationSummary): void;
}) {
  const t = useTranslations('talk.chat.group.create');
  const tNew = useTranslations('talk.chat.newChat');
  const tValidation = useTranslations('talk.validation');
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set());
  /** Complaints wait for the first try, so an empty form doesn't open in red. */
  const [tried, setTried] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  const nameIssue = validateGroupName(name);
  // Everyone in it counts, the creator included.
  const full = chosen.size >= GROUP_MEMBERS_MAX - 1;

  const toggle = (user: DirectoryUser): void => {
    setChosen(current => {
      const next = new Set(current);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      return next;
    });
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setTried(true);
    if (nameIssue !== null || chosen.size === 0 || creating) return;
    setCreating(true);
    setFailed(false);
    try {
      const { conversation } = await api.createGroup({ name: name.trim(), memberIds: [...chosen] });
      onCreated(conversation);
    } catch {
      setFailed(true);
      setCreating(false);
    }
  };

  return (
    <Modal open size="md" label={t('label')} title={t('title')} onClose={creating ? undefined : onClose} dismissible={!creating}>
      <form onSubmit={event => void submit(event)} noValidate>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} disabled={creating} className="-mt-1 -ml-3 mb-3 text-ink-muted">
          {t('back')}
        </Button>

        <Input
          label={t('nameLabel')}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={GROUP_NAME_MAX}
          autoComplete="off"
          error={tried && nameIssue ? tValidation(nameIssue.key, nameIssue.values ?? {}) : null}
        />

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-ink-muted">{t('peopleLabel')}</h3>
          <p
            // Read out as the count changes, so ticking a box is confirmed.
            aria-live="polite"
            className={cn('text-xs tabular-nums', tried && chosen.size === 0 ? 'font-medium text-danger' : 'text-ink-faint')}
          >
            {t('chosen', { count: chosen.size })}
          </p>
        </div>
        {full ? <p className="mt-1 text-xs text-ink-faint">{t('limit', { max: GROUP_MEMBERS_MAX })}</p> : null}

        <PeoplePicker meId={meId} statusOf={statusOf} chosen={chosen} onToggle={toggle} full={full} />

        {failed ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {t('failed')}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={creating}>
            {tNew('cancel')}
          </Button>
          <Button type="submit" icon={<UsersRound size={16} />} disabled={creating}>
            {creating ? t('creating') : t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
