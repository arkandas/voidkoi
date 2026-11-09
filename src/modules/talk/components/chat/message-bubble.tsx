'use client';

import { Ban, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActionMenu, type MenuAction } from '@/components/ui';
import { avatarTint } from '@/lib/avatar';
import { cn } from '@/lib/cn';
import { DownloadLink } from '@/modules/talk/components/files/download-link';
import { urls } from '@/modules/talk/lib/api';
import { iconType } from '@/modules/talk/lib/files';
import type { Attachment, ChatMessage } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

import { AttachmentFile, AttachmentImage } from './message-attachment';

export type DeleteScope = 'me' | 'everyone';

export interface MessageBubbleProps {
  message: ChatMessage;
  own: boolean;
  /** Dimmed until the server confirms it. */
  pending?: boolean;
  onDelete?(scope: DeleteScope): void;
  /** Opens a shared picture full screen. */
  onOpenAttachment?(attachment: Attachment): void;
  /** The sender's own copy of a picture they just sent, so it doesn't flicker while the server's preview loads. */
  localPreview?: string | null;
  /** Who said it, above the text: in a group, on the first of a run from somebody else. */
  senderName?: string | null;
}

export function MessageBubble({ message, own, pending = false, onDelete, onOpenAttachment, localPreview = null, senderName = null }: MessageBubbleProps) {
  const t = useTranslations('talk.chat.message');
  const format = useTimeFormat();
  const withdrawn = Boolean(message.deletedAt);
  const attachment = withdrawn ? null : (message.attachment ?? null);
  // A picture is drawn when there is something to draw it from; one without a preview is offered like any file.
  const picture = attachment?.isImage && (attachment.hasPreview || localPreview !== null) ? attachment : null;
  const time = format.time(message.createdAt);
  const deletable = onDelete !== undefined && !pending;

  // Nothing to withdraw twice, and an optimistic message has no server id yet.
  const actions: MenuAction[] = deletable
    ? [
        { label: t('deleteForMe'), icon: Trash2, onSelect: () => onDelete('me') },
        { label: t('deleteForEveryone'), icon: Trash2, danger: true, hidden: !own || withdrawn, onSelect: () => onDelete('everyone') },
      ]
    : [];

  return (
    <div className={cn('group/message flex items-center gap-1', own ? 'justify-end' : 'justify-start')}>
      {/* On the outside edge of the bubble, never over the text. */}
      {own && deletable ? <MessageMenu actions={actions} /> : null}

      <div
        className={cn(
          'max-w-[min(75%,34rem)] rounded-2xl',
          // A picture or a file card fills the bubble, with a thin margin round the edge.
          picture ? 'p-1' : attachment ? 'p-1.5' : 'px-3.5 py-2',
          // The tail: one squarer corner on the side the message came from.
          own ? 'rounded-br-md' : 'rounded-bl-md',
          // A withdrawn message keeps its place but stops looking like speech.
          withdrawn
            ? 'border border-dashed border-line-strong text-ink-faint'
            : own
              ? 'bg-accent text-accent-ink shadow-xs'
              : 'border border-line bg-card text-ink shadow-xs',
          pending && 'opacity-60',
        )}
      >
        {senderName ? (
          <p
            className={cn(
              // The sender's avatar colour, so a glance says who is talking.
              'truncate text-[13px] leading-tight font-semibold text-[rgb(var(--avatar-rgb))]',
              `avatar-${avatarTint(message.senderId)}`,
              attachment ? 'px-2 pt-1 pb-1.5' : 'pb-0.5',
            )}
          >
            {senderName}
          </p>
        ) : null}
        {withdrawn ? (
          <p className="flex items-center gap-1.5 text-sm italic">
            <Ban size={14} aria-hidden="true" />
            {t('deleted')}
          </p>
        ) : picture ? (
          <AttachmentImage
            src={localPreview ?? urls.preview(picture.id)}
            size={picture.width && picture.height ? { width: picture.width, height: picture.height } : null}
            alt={picture.name}
            openLabel={t('openImage', { name: picture.name })}
            {...(onOpenAttachment ? { onOpen: () => onOpenAttachment(picture) } : {})}
          >
            {message.body === '' ? (
              // With no caption to sit under, the time goes on the picture.
              <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded-full bg-stage/55 px-1.5 py-0.5 text-[11px] text-stage-ink tabular-nums">
                {time}
              </span>
            ) : null}
          </AttachmentImage>
        ) : attachment ? (
          <AttachmentFile
            name={attachment.name}
            contentType={iconType(attachment)}
            sizeBytes={attachment.sizeBytes}
            own={own}
            action={
              pending ? null : (
                <DownloadLink
                  attachmentId={attachment.id}
                  label={t('download', { name: attachment.name })}
                  className={
                    own
                      ? 'text-accent-ink hover:bg-accent-ink/15 focus-visible:ring-accent-ink/30'
                      : 'text-ink-muted hover:bg-surface hover:text-ink focus-visible:ring-line-strong'
                  }
                />
              )
            }
          />
        ) : null}
        {!withdrawn && message.body !== '' ? (
          <p className={cn('text-[15px] leading-snug break-words whitespace-pre-wrap', attachment && 'px-2 pt-1.5')}>{message.body}</p>
        ) : null}
        {picture && message.body === '' ? null : (
          <p
            className={cn(
              'mt-0.5 text-right text-[11px] tabular-nums',
              attachment && 'px-2 pb-0.5',
              withdrawn ? 'text-ink-faint' : own ? 'text-accent-ink/90' : 'text-ink-faint',
            )}
          >
            {time}
          </p>
        )}
      </div>

      {!own && deletable ? <MessageMenu actions={actions} /> : null}
    </div>
  );
}

/** Hidden until the row is hovered or has focus, so a transcript isn't a wall of buttons; never hidden from the keyboard. */
function MessageMenu({ actions }: { actions: MenuAction[] }) {
  const t = useTranslations('talk.chat.message');
  return (
    <div className="opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100">
      <ActionMenu label={t('actions')} actions={actions} triggerClassName="size-7 rounded-md text-ink-faint">
        <MoreHorizontal size={16} />
      </ActionMenu>
    </div>
  );
}
