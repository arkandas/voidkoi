'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { FileIcon } from '@/components/ui/file-icon';
import { fileExtension } from '@/lib/file-types';
import { bubbleImageSize, type Size } from '@/modules/talk/lib/files';

export interface AttachmentImageProps {
  src: string | null;
  /** The original's size, so the box is reserved before anything loads. */
  size: Size | null;
  alt: string;
  /** Opens the picture full screen; named for a screen reader by `openLabel`. */
  onOpen?(): void;
  openLabel?: string;
  /** Drawn over the bottom of the picture: the time, or an upload's progress. */
  children?: ReactNode;
}

/** A picture inside a bubble, in a box from its real shape so the transcript doesn't jump as it loads. */
export function AttachmentImage({ src, size, alt, onOpen, openLabel, children }: AttachmentImageProps) {
  const box = bubbleImageSize(size);
  const picture = src ? (
    <img src={src} alt={alt} width={box.width} height={box.height} loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
  ) : null;

  return (
    <div className="relative max-w-full overflow-hidden rounded-xl bg-muted" style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="block size-full cursor-zoom-in focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/40 focus-visible:ring-inset"
        >
          {picture}
        </button>
      ) : (
        picture
      )}
      {children}
    </div>
  );
}

export interface AttachmentFileProps {
  name: string;
  /** What its icon goes by; null for the name to decide. */
  contentType: string | null;
  sizeBytes: number;
  /** On the accent, as your own bubbles are, or on the card. */
  own: boolean;
  /** What sits at the end of the row: a download link, or an upload's cancel. */
  action?: ReactNode;
  /** A second line under the name, instead of the type and size. */
  detail?: ReactNode;
  children?: ReactNode;
}

/** A file that isn't shown in the page: its icon, name, size, and a way to get it. */
export function AttachmentFile({ name, contentType, sizeBytes, own, action, detail, children }: AttachmentFileProps) {
  const locale = useLocale();
  const extension = fileExtension(name).toUpperCase();
  const size = formatBytes(sizeBytes, locale);

  return (
    <div className="w-[min(16rem,62vw)] max-w-full">
      <div className={cn('flex items-center gap-2.5 rounded-xl p-2', own ? 'bg-accent-ink/12' : 'bg-muted')}>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', own ? 'bg-accent-ink/15 text-accent-ink' : 'bg-accent-soft text-accent dark:bg-card')}>
          <FileIcon mime={contentType} name={name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" title={name}>
            {name}
          </span>
          <span className={cn('block truncate text-xs tabular-nums', own ? 'text-accent-ink' : 'text-ink-muted')}>
            {detail ?? (extension ? `${extension} · ${size}` : size)}
          </span>
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
