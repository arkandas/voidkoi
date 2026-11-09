'use client';

import { MessageCircle, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { urls } from '@/modules/talk/lib/api';
import type { Size } from '@/modules/talk/lib/files';
import type { Attachment } from '@/modules/talk/lib/protocol';

import { DownloadLink } from './download-link';

export interface AttachmentViewerProps {
  attachment: Attachment;
  /** Who shared it and when, e.g. "Ada Lovelace · Today, 10:30". */
  detail: string;
  onClose(): void;
  /** Offered from the Files page, where the conversation is somewhere else. */
  onShowInChat?(): void;
}

/**
 * A picture on its own, across the whole screen, on the dark stage whatever
 * the theme. A native `<dialog>`: mounting it is opening it.
 */
export function AttachmentViewer({ attachment, detail, onClose, onShowInChat }: AttachmentViewerProps) {
  const t = useTranslations('talk.chat.viewer');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(
    attachment.width && attachment.height ? { width: attachment.width, height: attachment.height } : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event): void => {
      // Escape: React decides whether the viewer is open, not the platform.
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, [onClose]);

  // Drawn at a size worked out from the room it has, so the space around it is backdrop: a click there closes.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Never enlarged: a small picture blown up only shows its pixels.
  const drawn =
    natural && stage
      ? (() => {
          const scale = Math.min(1, stage.width / natural.width, stage.height / natural.height);
          return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) };
        })()
      : null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('label', { name: attachment.name })}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none flex-col bg-stage/95 text-stage-ink open:flex"
      onClick={event => {
        // Anything that is not a control or the picture itself is backdrop.
        if (event.target === event.currentTarget || event.target === stageRef.current) onClose();
      }}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{attachment.name}</p>
          <p className="truncate text-sm text-stage-ink-muted">
            {detail} · {formatBytes(attachment.sizeBytes, locale)}
          </p>
        </div>
        {onShowInChat ? <IconButton variant="stage" label={t('showInChat')} onClick={onShowInChat} icon={<MessageCircle size={18} />} /> : null}
        <DownloadLink
          attachmentId={attachment.id}
          label={t('download', { name: attachment.name })}
          className="size-10 bg-white/15 text-stage-ink backdrop-blur-sm hover:bg-white/25 focus-visible:ring-white/30"
        />
        <IconButton variant="stage" label={tCommon('close')} onClick={onClose} icon={<X size={20} />} autoFocus />
      </header>

      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        {failed ? (
          <p className="text-sm text-stage-ink-muted">{t('failed')}</p>
        ) : (
          <img
            src={urls.attachment(attachment.id)}
            alt={attachment.name}
            onLoad={event => {
              const image = event.currentTarget;
              if (!natural) setNatural({ width: image.naturalWidth, height: image.naturalHeight });
            }}
            onError={() => setFailed(true)}
            // The preview, already cached from the chat, stands in while the full picture arrives.
            style={{
              ...(drawn ? { width: drawn.width, height: drawn.height } : {}),
              ...(attachment.hasPreview ? { backgroundImage: `url("${urls.preview(attachment.id)}")` } : {}),
            }}
            className={cn('rounded-lg bg-contain bg-center bg-no-repeat object-contain select-none', !drawn && 'max-h-full max-w-full')}
          />
        )}
      </div>
    </dialog>
  );
}
