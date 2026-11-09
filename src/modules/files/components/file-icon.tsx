import { Play } from 'lucide-react';

import { FileIcon, kindColor } from '@/components/ui/file-icon';
import { cn } from '@/lib/cn';
import { fileKind, type FileKind } from '@/lib/file-types';

export { FileIcon, kindColor };

/** Thumbnails that are pages, shown from the top: PDFs and text. */
export function isPage(kind: FileKind): boolean {
  return kind === 'pdf' || kind === 'text' || kind === 'code';
}

/** The square a file's icon sits on: the accent for folders, quieter for files. */
export function FileTile({
  kind,
  mime,
  name,
  thumbnail,
  className,
}: {
  kind: 'folder' | 'file';
  mime: string | null;
  name: string;
  /** A picture to show instead of the icon. */
  thumbnail?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl',
        kind === 'folder' ? 'bg-accent-soft text-accent' : cn('bg-muted', kindColor(fileKind(mime, name)) ?? 'text-ink-muted'),
        thumbnail && "after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-black/10 after:ring-inset after:content-[''] dark:after:ring-white/10",
        className,
      )}
    >
      {thumbnail ? (
        <>
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn('size-full object-cover', isPage(fileKind(mime, name)) && 'object-left-top')}
          />
          {kind === 'file' && fileKind(mime, name) === 'video' ? <PlayBadge /> : null}
        </>
      ) : (
        <FileIcon kind={kind} mime={mime} name={name} />
      )}
    </span>
  );
}

/** Over a video's thumbnail, so it doesn't pass for a photo. Its parent must be positioned. */
export function PlayBadge({ large = false }: { large?: boolean }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className={cn('flex items-center justify-center rounded-full bg-black/55 text-white', large ? 'size-11' : 'size-5')}>
        <Play size={large ? 20 : 10} fill="currentColor" className="translate-x-px" />
      </span>
    </span>
  );
}
