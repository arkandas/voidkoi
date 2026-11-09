'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';

import { UploadAbortedError, api, uploadFile, type UploadHandle } from '../api';
import { canPreview, makePreview, type PreparedPreview } from '../preview-image';
import type { Attachment } from '../protocol';

/**
 * A file on its way into a conversation, drawn in the transcript until it
 * becomes a message.
 *
 * `uploading` covers the bytes going up and, for a picture, its preview after
 * them. `failed` waits for a retry or a cancel; `attachment` being set then
 * means the file is already stored and only the message still has to go.
 */
export interface PendingUpload {
  /** Local, and also the clientId of the message it becomes. */
  key: string;
  conversationId: number;
  name: string;
  size: number;
  /** A picture this browser could draw, so the bubble shows it rather than an icon. */
  looksLikeImage: boolean;
  /** An object URL of the preview once it is made. Owned by whoever holds the upload. */
  localPreview: string | null;
  width: number | null;
  height: number | null;
  status: 'uploading' | 'failed';
  /** 0 to 1, bytes sent over bytes to send. */
  progress: number;
  /** What went wrong, in the reader's language. */
  error: string | null;
  attachment: Attachment | null;
}

interface Job {
  upload: PendingUpload;
  file: File;
  handle: UploadHandle | null;
  preview: Promise<PreparedPreview | null>;
  cancelled: boolean;
}

export interface UseUploadsOptions {
  /** The server's cap, or null when it has not said. */
  maxUploadBytes: number | null;
  /**
   * Hand a stored file over to be sent as a message. Returns false when it
   * could not go (no socket), which leaves the upload failed and retryable.
   * On true, the upload leaves the list and its `localPreview` goes with it.
   */
  deliver(upload: PendingUpload, attachment: Attachment): boolean;
}

export interface UseUploads {
  uploads: PendingUpload[];
  /** Start sending files to a conversation. Returns the ones too big to try. */
  add(conversationId: number, files: readonly File[]): File[];
  cancel(key: string): void;
  retry(key: string): void;
}

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useUploads({ maxUploadBytes, deliver }: UseUploadsOptions): UseUploads {
  const t = useTranslations('talk.chat.attach');
  const apiError = useApiError();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  // The source of truth for the async work below, which must not wait on a
  // render to see the latest state. `uploads` is its published copy.
  const [jobs] = useState(() => new Map<string, Job>());
  /**
   * One file at a time, in the order they were picked: several photos should
   * arrive in the order they were chosen, not in the order they finished.
   */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const deliverRef = useRef(deliver);
  const wordsRef = useRef(t);
  const apiErrorRef = useRef(apiError);

  useEffect(() => {
    deliverRef.current = deliver;
    wordsRef.current = t;
    apiErrorRef.current = apiError;
  });

  const publish = useCallback(() => {
    setUploads([...jobs.values()].map((job) => job.upload));
  }, [jobs]);

  const patch = useCallback(
    (key: string, changes: Partial<PendingUpload>) => {
      const job = jobs.get(key);
      if (!job) return;
      job.upload = { ...job.upload, ...changes };
      publish();
    },
    [jobs, publish],
  );

  const run = useCallback(
    async (key: string): Promise<void> => {
      const job = jobs.get(key);
      if (!job || job.cancelled) return;
      const { conversationId } = job.upload;
      let attachment = job.upload.attachment;

      try {
        if (!attachment) {
          patch(key, { status: 'uploading', progress: 0, error: null });
          const handle = uploadFile(conversationId, job.file, (progress) =>
            patch(key, { progress }),
          );
          job.handle = handle;
          attachment = (await handle.promise).attachment;
          job.handle = null;

          // The server decides what counts as a picture, from the bytes. Only
          // then is a preview worth sending; failing to is not fatal.
          if (attachment.isImage && !attachment.hasPreview && !job.cancelled) {
            const preview = await job.preview;
            if (preview && !job.cancelled) {
              try {
                ({ attachment } = await api.uploadPreview(attachment.id, preview.blob, preview));
              } catch {
                // Sent without one: it shows as a file card instead.
              }
            }
          }
          patch(key, { attachment, progress: 1 });
        }

        if (job.cancelled) {
          void api.cancelUpload(attachment.id).catch(() => undefined);
          return;
        }

        if (deliverRef.current(job.upload, attachment)) {
          jobs.delete(key);
          publish();
        } else {
          patch(key, { status: 'failed', error: wordsRef.current('notSent') });
        }
      } catch (error) {
        job.handle = null;
        if (error instanceof UploadAbortedError || job.cancelled) return;
        patch(key, { status: 'failed', error: error instanceof ApiError ? apiErrorRef.current(error, 'uploadFailed') : wordsRef.current('failed') });
      }
    },
    [jobs, patch, publish],
  );

  const enqueue = useCallback(
    (key: string) => {
      queue.current = queue.current.then(() => run(key));
    },
    [run],
  );

  const add = useCallback(
    (conversationId: number, files: readonly File[]): File[] => {
      const tooLarge: File[] = [];
      for (const file of files) {
        if (maxUploadBytes !== null && file.size > maxUploadBytes) {
          tooLarge.push(file);
          continue;
        }
        const key = newKey();
        const preview = makePreview(file);
        jobs.set(key, {
          file,
          handle: null,
          preview,
          cancelled: false,
          upload: {
            key,
            conversationId,
            name: file.name,
            size: file.size,
            looksLikeImage: canPreview(file),
            localPreview: null,
            width: null,
            height: null,
            status: 'uploading',
            progress: 0,
            error: null,
            attachment: null,
          },
        });
        // The thumbnail appears as soon as it is made, while the bytes go up.
        void preview.then((made) => {
          const job = jobs.get(key);
          if (!made || !job || job.cancelled) return;
          patch(key, {
            localPreview: URL.createObjectURL(made.blob),
            width: made.width,
            height: made.height,
          });
        });
        enqueue(key);
      }
      publish();
      return tooLarge;
    },
    [maxUploadBytes, jobs, patch, publish, enqueue],
  );

  const cancel = useCallback(
    (key: string) => {
      const job = jobs.get(key);
      if (!job) return;
      job.cancelled = true;
      job.handle?.abort();
      // Stored but never sent: the server should not keep it.
      if (job.upload.attachment) {
        void api.cancelUpload(job.upload.attachment.id).catch(() => undefined);
      }
      if (job.upload.localPreview) URL.revokeObjectURL(job.upload.localPreview);
      jobs.delete(key);
      publish();
    },
    [jobs, publish],
  );

  const retry = useCallback(
    (key: string) => {
      const job = jobs.get(key);
      if (!job || job.upload.status !== 'failed') return;
      patch(key, { status: 'uploading', error: null });
      enqueue(key);
    },
    [jobs, patch, enqueue],
  );

  return { uploads, add, cancel, retry };
}
