'use client';

import { AlertCircle, RotateCcw, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import type { PendingUpload } from '@/modules/talk/lib/hooks/use-uploads';

import { AttachmentFile, AttachmentImage } from './message-attachment';

export interface UploadBubbleProps {
  upload: PendingUpload;
  onCancel(): void;
  onRetry(): void;
}

/**
 * A file on its way, where its message will be, shaped like the bubble it
 * turns into. A failed one drops the accent, so it doesn't read as sent.
 */
export function UploadBubble({ upload, onCancel, onRetry }: UploadBubbleProps) {
  const t = useTranslations('talk.chat.attach');
  const locale = useLocale();
  const failed = upload.status === 'failed';
  const percent = Math.round(upload.progress * 100);
  const picture = upload.looksLikeImage && upload.localPreview !== null;

  const progress = (
    <div
      role="progressbar"
      aria-label={t('progress', { name: upload.name })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('h-1 overflow-hidden rounded-full', picture ? 'bg-white/30' : 'bg-accent-ink/25')}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-200', picture ? 'bg-white' : 'bg-accent-ink')} style={{ width: `${Math.max(3, percent)}%` }} />
    </div>
  );

  const retry = <IconButton size="sm" variant="outline" label={t('retry', { name: upload.name })} onClick={onRetry} icon={<RotateCcw size={15} />} />;

  const cancel = (
    <IconButton
      size="sm"
      variant={picture ? 'stage' : 'ghost'}
      label={t(failed ? 'remove' : 'cancel', { name: upload.name })}
      onClick={onCancel}
      icon={<X size={16} />}
      className={cn(!picture && !failed && 'text-accent-ink hover:bg-accent-ink/15 hover:text-accent-ink')}
    />
  );

  return (
    <div className="flex justify-end">
      <div
        className={cn(
          'max-w-[min(75%,34rem)] rounded-2xl rounded-br-md shadow-xs',
          picture ? 'p-1' : 'p-1.5',
          failed ? 'border border-line bg-card text-ink' : 'bg-accent text-accent-ink',
        )}
      >
        {picture ? (
          <AttachmentImage src={upload.localPreview} size={upload.width && upload.height ? { width: upload.width, height: upload.height } : null} alt={upload.name}>
            <div className="absolute top-1.5 right-1.5">{cancel}</div>
            {failed ? (
              <div className="absolute inset-0 flex items-center justify-center bg-stage/45">{retry}</div>
            ) : (
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-stage/85 to-transparent px-2.5 pt-6 pb-2">{progress}</div>
            )}
          </AttachmentImage>
        ) : (
          <AttachmentFile
            name={upload.name}
            contentType={null}
            sizeBytes={upload.size}
            own={!failed}
            detail={failed ? formatBytes(upload.size, locale) : t('uploading', { percent, size: formatBytes(upload.size, locale) })}
            action={
              failed ? (
                <span className="flex items-center gap-1">
                  {retry}
                  {cancel}
                </span>
              ) : (
                cancel
              )
            }
          >
            {failed ? null : <div className="px-2 pt-1.5 pb-1">{progress}</div>}
          </AttachmentFile>
        )}
        {failed ? (
          <p role="alert" className="flex items-start gap-1.5 px-2 pt-1.5 pb-0.5 text-xs text-danger">
            <AlertCircle size={14} aria-hidden="true" className="mt-px shrink-0" />
            {upload.error ?? t('failed')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
