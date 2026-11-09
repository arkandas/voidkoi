'use client';

import { ChevronLeft, ChevronRight, Download, Pencil, Share2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FileIcon } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { TextFile, type Saver } from '@/modules/files/components/text-file';
import { AudioPanel } from '@/modules/files/components/media/audio-player';
import { EpubReader } from '@/modules/files/components/media/epub-reader';
import { VideoPlayer } from '@/modules/files/components/media/video-player';
import { Button, IconButton } from '@/components/ui';
import { download, urls } from '@/modules/files/lib/api';
import type { ItemDto } from '@/modules/files/lib/api-types';
import { isEditable, previewKind } from '@/lib/file-types';
import { formatBytes, formatDateTime } from '@/lib/format';

export interface ViewerSource {
  /** Where the bytes are: shown in the page, or as a download. */
  content(item: ItemDto, download?: boolean): string;
  /** The WebP copy of an image the browser can't show itself. */
  preview(item: ItemDto): string;
  /** The thumbnail: a video's poster, a song's album art. */
  thumbnail(item: ItemDto): string;
  /** What the player needs to know about a video or audio file. */
  media(item: ItemDto): string;
  /** A video or audio file converted by the server as it plays, from `start` seconds. */
  stream(item: ItemDto, start: number): string;
}

/** Files of signed-in people: their own, and what was shared with them. */
export const appSource: ViewerSource = {
  content: (item, asDownload = false) => urls.content(item.id, asDownload),
  preview: item => urls.preview(item),
  thumbnail: item => urls.thumbnail(item),
  media: item => urls.media(item),
  stream: (item, start) => urls.stream(item, start),
};

/** Files reached through a link. */
export function linkSource(token: string): ViewerSource {
  return {
    content: (item, asDownload = false) => urls.linkContent(token, item.id, asDownload),
    preview: item => urls.linkPreview(token, item),
    thumbnail: item => urls.linkThumbnail(token, item),
    media: item => urls.linkMedia(token, item),
    stream: (item, start) => urls.linkStream(token, item, start),
  };
}

export interface ViewerProps {
  items: ItemDto[];
  index: number;
  source: ViewerSource;
  onIndex(index: number): void;
  onClose(): void;
  /** The owner can share from here. */
  onShare?(item: ItemDto): void;
  /** The owner can edit text files here: called with the file after each save. */
  onSaved?(item: ItemDto): void;
  /** Which files can be edited, when only some are the owner's. */
  mayEdit?(item: ItemDto): boolean;
}

/**
 * One file at a time across the whole screen, on the dark stage whatever the
 * theme. Arrow keys and the side buttons step through the folder. The owner's
 * text files can be edited; leaving saves what is left first.
 */
export function Viewer({ items, index, source, onIndex, onClose, onShare, onSaved, mayEdit }: ViewerProps) {
  const t = useTranslations('files.viewer');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<() => void>(onClose);
  const [failed, setFailed] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editable, setEditable] = useState<number | null>(null);
  const saver = useRef<Saver>(null);
  const item = items[index];
  // A book has its own arrows, for its pages.
  const reading = !!item && previewKind(item.mime, item.name) === 'epub';

  // Leaving while editing saves first; a save that fails keeps the editor open.
  const leave = useCallback(async (): Promise<void> => {
    if (editing && saver.current && !(await saver.current.flush())) return;
    onClose();
  }, [editing, onClose]);

  const finish = async (): Promise<void> => {
    if (saver.current && !(await saver.current.flush())) return;
    setEditing(false);
  };

  useEffect(() => {
    closeRef.current = () => void leave();
  }, [leave]);

  // Opened once, when it mounts. Showing it again would lift it over a dialog opened from it, like Share.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event): void => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (editing || reading) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'VIDEO', 'AUDIO'].includes(event.target.tagName)) return;
      // Something opened over the viewer, like Share, has the keyboard.
      const open = document.querySelectorAll('dialog[open]');
      if (open[open.length - 1] !== dialogRef.current) return;
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, editing, reading]);

  if (!item) return null;

  const kind = failed === item.id ? null : item.hasPreview ? 'image' : previewKind(item.mime, item.name);
  const url = item.hasPreview ? source.preview(item) : source.content(item);
  const canEdit =
    !!onSaved && (mayEdit?.(item) ?? true) && kind === 'text' && editable === item.id && isEditable(item.mime, item.name, item.size);
  const stepping = !editing && !reading;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('label', { name: item.name })}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none flex-col bg-stage/95 text-stage-ink open:flex"
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <FileName name={item.name} plain className="text-[15px] font-semibold" />
          <p className="truncate text-sm text-stage-ink-muted tabular-nums">
            {formatBytes(item.size, locale)} · {formatDateTime(item.updatedAt, locale)}
            {items.length > 1 ? ` · ${t('position', { index: index + 1, count: items.length })}` : ''}
          </p>
        </div>
        {editing ? (
          <Button size="sm" onClick={() => void finish()}>
            {t('done')}
          </Button>
        ) : (
          <>
            {canEdit ? <IconButton variant="stage" label={t('edit')} icon={<Pencil size={18} />} onClick={() => setEditing(true)} /> : null}
            {onShare ? (
              <IconButton variant="stage" label={t('share')} icon={<Share2 size={18} />} onClick={() => onShare(item)} />
            ) : null}
            <IconButton variant="stage" label={t('download')} icon={<Download size={18} />} onClick={() => download(source.content(item, true))} />
          </>
        )}
        <IconButton variant="stage" label={tCommon('close')} icon={<X size={20} />} onClick={() => void leave()} autoFocus />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-16">
        {kind === 'image' ? (
          <img
            key={item.id}
            src={url}
            alt={item.name}
            onError={() => setFailed(item.id)}
            className="max-h-full max-w-full rounded-lg object-contain select-none"
          />
        ) : kind === 'video' ? (
          <VideoPlayer key={item.id} item={item} source={source} />
        ) : kind === 'audio' ? (
          <AudioPanel
            items={items}
            item={item}
            source={source}
            onTrack={next => onIndex(items.findIndex(entry => entry.id === next.id))}
          />
        ) : kind === 'epub' ? (
          <EpubReader key={item.id} item={item} source={source} />
        ) : kind === 'pdf' ? (
          <iframe key={item.id} src={url} title={item.name} className="size-full max-w-5xl rounded-lg bg-white" />
        ) : kind === 'text' ? (
          <TextFile
            key={item.id}
            item={item}
            url={url}
            editing={editing}
            onEditable={value => setEditable(value ? item.id : null)}
            onSaved={onSaved}
            saver={saver}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex size-24 items-center justify-center rounded-3xl bg-white/10">
              <FileIcon kind="file" mime={item.mime} name={item.name} size={44} />
            </span>
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="mt-1 text-sm text-stage-ink-muted">{t('noPreview')}</p>
            </div>
            <Button onClick={() => download(source.content(item, true))} icon={<Download size={16} />}>
              {t('downloadSize', { size: formatBytes(item.size, locale) })}
            </Button>
          </div>
        )}

        {index > 0 && stepping ? (
          <IconButton
            variant="stage"
            label={t('previous')}
            icon={<ChevronLeft size={22} />}
            onClick={() => onIndex(index - 1)}
            className="absolute top-1/2 left-2 -translate-y-1/2 sm:left-4"
          />
        ) : null}
        {index < items.length - 1 && stepping ? (
          <IconButton
            variant="stage"
            label={t('next')}
            icon={<ChevronRight size={22} />}
            onClick={() => onIndex(index + 1)}
            className="absolute top-1/2 right-2 -translate-y-1/2 sm:right-4"
          />
        ) : null}
      </div>
    </dialog>
  );
}
