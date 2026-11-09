'use client';

import { ArrowLeft, Eraser, MoreVertical, Phone, Trash2, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionMenu, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import type { DirectoryUser, UserStatus } from '@/modules/talk/lib/protocol';

/** Keys under `talk.chat.status` and `talk.people.status`. */
export const STATUS_KEY = {
  online: 'online',
  'in-call': 'inCall',
  offline: 'offline',
} as const satisfies Record<UserStatus, string>;

export const STATUS_COLOUR: Record<UserStatus, string> = {
  online: 'text-success',
  'in-call': 'text-warning',
  offline: 'text-ink-muted',
};

export interface ChatHeaderProps {
  other: DirectoryUser;
  status: UserStatus;
  onCall(media: 'audio' | 'video'): void;
  callDisabled: boolean;
  /** Empties this person's copy of the conversation; the other keeps theirs. */
  onClear?(): void;
  /** Delete the whole chat from this person's list; asks first. */
  onDelete?(): void;
  /** On a phone, the way back to the list of conversations. */
  onBack?(): void;
}

export function ChatHeader({ other, status, onCall, callDisabled, onClear, onDelete, onBack }: ChatHeaderProps) {
  const t = useTranslations('talk.chat');
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {onBack ? <IconButton label={t('header.back')} onClick={onBack} icon={<ArrowLeft size={18} />} className="lg:hidden" /> : null}
        <PersonAvatar person={other} size="md" status={status} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] leading-tight font-semibold text-ink">{other.displayName}</h2>
          <p className={cn('truncate text-xs leading-tight', STATUS_COLOUR[status])}>{t(`status.${STATUS_KEY[status]}`)}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton
          variant="outline"
          label={t('header.videoCall', { name: other.displayName })}
          onClick={() => onCall('video')}
          disabled={callDisabled}
          icon={<Video size={18} />}
        />
        <IconButton
          variant="default"
          label={t('header.call', { name: other.displayName })}
          onClick={() => onCall('audio')}
          disabled={callDisabled}
          icon={<Phone size={18} />}
        />
        {onClear ? (
          <ActionMenu
            label={t('header.actions')}
            triggerClassName="size-10"
            actions={[
              { label: t('header.clear'), icon: Eraser, onSelect: onClear },
              { label: t('header.delete'), icon: Trash2, danger: true, hidden: !onDelete, onSelect: () => onDelete?.() },
            ]}
          >
            <MoreVertical size={18} />
          </ActionMenu>
        ) : null}
      </div>
    </header>
  );
}
