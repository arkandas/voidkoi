'use client';

import { ArrowLeft, Eraser, Info, LogOut, MoreVertical, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { ActionMenu, IconButton } from '@/components/ui';
import { GroupAvatar } from '@/modules/talk/components/ui/person-avatar';
import { urls } from '@/modules/talk/lib/api';
import { isOwner, membersLine } from '@/modules/talk/lib/groups';
import { useNoticeWords } from '@/modules/talk/lib/hooks/use-notice-words';
import type { GroupInfo } from '@/modules/talk/lib/protocol';

export type GroupAction = 'info' | 'clear' | 'leave' | 'deleteGroup' | 'deleteChat';

export interface GroupHeaderProps {
  conversationId: number;
  group: GroupInfo;
  viewerId: number;
  onAction(action: GroupAction): void;
  /** On a phone, the way back to the list of conversations. */
  onBack?(): void;
}

/** The top of an open group: its name, who is in it, and what can be done with it. No call buttons: calls are between two people. */
export function GroupHeader({ conversationId, group, viewerId, onAction, onBack }: GroupHeaderProps) {
  const t = useTranslations('talk.chat');
  const locale = useLocale();
  const words = useNoticeWords();
  const owner = isOwner(group, viewerId);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {onBack ? <IconButton label={t('header.back')} onClick={onBack} icon={<ArrowLeft size={18} />} className="lg:hidden" /> : null}
        <GroupAvatar size="md" photoUrl={urls.groupPhoto(conversationId, group.photoVersion)} />
        <div className="min-w-0">
          {/* The name opens the details, as in every messenger; a button inside the heading, so the heading is still named by the group. */}
          <h2 className="truncate text-[15px] leading-tight font-semibold text-ink">
            <button
              type="button"
              onClick={() => onAction('info')}
              title={t('group.header.openInfo', { name: group.name })}
              className="max-w-full truncate rounded-sm text-left hover:underline focus:outline-hidden focus-visible:ring-4 focus-visible:ring-line-strong"
            >
              {group.name}
            </button>
          </h2>
          <p className="truncate text-xs leading-tight text-ink-muted">{membersLine(group, viewerId, locale, words)}</p>
        </div>
      </div>

      {/* Leaving comes before deleting: everybody may do it, and it destroys least. */}
      <ActionMenu
        label={t('header.actions')}
        triggerClassName="size-10"
        actions={[
          { label: t('group.header.info'), icon: Info, onSelect: () => onAction('info') },
          { label: t('header.clear'), icon: Eraser, onSelect: () => onAction('clear') },
          { label: t('group.header.leave'), icon: LogOut, danger: true, hidden: !group.active, onSelect: () => onAction('leave') },
          { label: t('group.header.deleteChat'), icon: Trash2, danger: true, hidden: group.active, onSelect: () => onAction('deleteChat') },
          { label: t('group.header.deleteGroup'), icon: Trash2, danger: true, hidden: !owner, onSelect: () => onAction('deleteGroup') },
        ]}
      >
        <MoreVertical size={18} />
      </ActionMenu>
    </header>
  );
}
