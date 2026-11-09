/** Files shared in conversations: uploading them, their previews, serving them, and the Files page. */
import { Readable } from 'node:stream';

import { ApiError } from '@/lib/error-codes';
import { contentDisposition } from '@/lib/http';
import { PREVIEW_MAX_BYTES, type FilesFilter, type FilesResponse, type UploadResponse } from '@/modules/talk/lib/protocol';

import {
  decodeFilesCursor,
  deleteAttachmentRows,
  findAttachment,
  findVisibleAttachment,
  insertAttachmentWithin,
  listSharedFiles,
  setPreview,
  toAttachment,
  uploadedBytes,
  type AttachmentRow,
} from '../attachments';
import { isActiveMember } from '../conversations';
import { cleanContentType, cleanFileName, sniffImageType, sniffViewableImage } from '../files/sniff';
import { isFileId, newFileId, TooLargeError, type StoredKind } from '../files/store';
import type { TalkHub } from '../hub';
import { notFound } from './http';

/** A year. An id never names other bytes, so a file can be cached for good. */
const MAX_AGE = 31_536_000;

export interface UploadInput {
  body: ReadableStream<Uint8Array> | null;
  /** What the browser said, before a byte is read. */
  contentLength: number | null;
  contentType: string | null;
  /** The name, URI-encoded: headers are Latin-1. */
  fileName: string | null;
  fileType: string | null;
}

function tooLarge(): never {
  throw new ApiError('fileTooLarge', 413);
}

function quotaExceeded(): never {
  throw new ApiError('quotaExceeded', 413);
}

/**
 * Upload a file to a conversation. It is sent separately, as a message on the
 * socket. Everything an account has uploaded and is still kept fits in its
 * quota, this one included.
 */
export async function upload(hub: TalkHub, userId: number, conversationId: number, input: UploadInput): Promise<UploadResponse> {
  if (!(await isActiveMember(hub.db, conversationId, userId))) throw new ApiError('notInConversation', 403);
  if (input.contentType !== 'application/octet-stream' || !input.body) throw new ApiError('invalidInput', 400);
  const max = hub.config.maxUploadBytes;
  const quota = hub.config.uploadQuotaBytes;
  // Refused before a byte is read, when the browser says up front it is too big, or won't fit.
  if (input.contentLength !== null && input.contentLength > max) tooLarge();
  const room = quota - (await uploadedBytes(hub.db, userId));
  if (room <= 0 || (input.contentLength !== null && input.contentLength > room)) quotaExceeded();

  const id = newFileId();
  // One that won't fit stops arriving at the edge of the room left.
  const limit = room < max ? room : max;
  let received;
  try {
    received = await hub.files.store.receive('files', id, Readable.fromWeb(input.body as Parameters<typeof Readable.fromWeb>[0]), limit);
  } catch (error) {
    if (error instanceof TooLargeError) {
      if (limit < max) quotaExceeded();
      tooLarge();
    }
    throw error;
  }
  if (received.sizeBytes === 0) {
    await hub.files.store.remove(id);
    throw new ApiError('emptyAttachment', 400);
  }

  const image = sniffViewableImage(received.head);
  // Checked again with all of it in: the account's other uploads may have landed meanwhile.
  const row = await insertAttachmentWithin(
    hub.db,
    {
      id,
      uploader_id: userId,
      conversation_id: conversationId,
      file_name: cleanFileName(input.fileName),
      content_type: image ?? cleanContentType(input.fileType),
      size_bytes: received.sizeBytes,
      is_image: image !== null,
    },
    quota,
  );
  if (!row) {
    await hub.files.store.remove(id);
    quotaExceeded();
  }
  return { attachment: toAttachment(row) };
}

function dimension(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 && value <= 100_000 ? value : null;
}

/** The small picture the sender's browser made, before the file is sent. */
export async function uploadPreview(
  hub: TalkHub,
  userId: number,
  attachmentId: string,
  input: UploadInput & { width: string | null; height: string | null },
): Promise<UploadResponse> {
  const row = isFileId(attachmentId) ? await findAttachment(hub.db, attachmentId) : null;
  if (!row || row.uploader_id !== userId || row.message_id !== null) notFound('uploadNotFound');

  const width = dimension(input.width);
  const height = dimension(input.height);
  if (width === null || height === null) throw new ApiError('previewSizeMissing', 400);
  if (!input.body) throw new ApiError('invalidInput', 400);
  if (input.contentLength !== null && input.contentLength > PREVIEW_MAX_BYTES) tooLarge();

  let received;
  try {
    received = await hub.files.store.receive('previews', attachmentId, Readable.fromWeb(input.body as Parameters<typeof Readable.fromWeb>[0]), PREVIEW_MAX_BYTES);
  } catch (error) {
    if (error instanceof TooLargeError) tooLarge();
    throw error;
  }
  // Shown in everyone's page, so only a picture, by its bytes.
  const type = sniffImageType(received.head);
  if (!type) {
    await hub.files.store.removeFrom('previews', attachmentId);
    throw new ApiError('previewNotPicture', 400);
  }

  const updated = await setPreview(hub.db, attachmentId, userId, { type, width, height });
  if (!updated) {
    // Sent while the preview was arriving; it goes without one.
    await hub.files.store.removeFrom('previews', attachmentId);
    notFound('uploadNotFound');
  }
  return { attachment: toAttachment(updated) };
}

/** Changed their mind before sending. */
export async function cancelUpload(hub: TalkHub, userId: number, attachmentId: string): Promise<void> {
  const row = isFileId(attachmentId) ? await findAttachment(hub.db, attachmentId) : null;
  if (!row || row.uploader_id !== userId || row.message_id !== null) notFound('uploadNotFound');
  await deleteAttachmentRows(hub.db, [attachmentId]);
  await hub.files.store.remove(attachmentId);
}

/**
 * A file, or its preview, for someone who may see it. Only a picture is ever
 * shown in the page, and only as the type its bytes say; everything else is a
 * download of opaque bytes, whatever it is called, since an HTML or SVG file
 * opened here could run as this site.
 */
export async function serveAttachment(hub: TalkHub, userId: number, attachmentId: string, kind: 'files' | 'previews', options: { download: boolean; etag: string | null }): Promise<Response> {
  const row: AttachmentRow | null = isFileId(attachmentId) ? await findVisibleAttachment(hub.db, attachmentId, userId) : null;
  if (!row || (kind === 'previews' && row.preview_type === null)) notFound('attachmentNotFound');

  const tag = `"${kind}-${row.id}"`;
  if (options.etag === tag) return new Response(null, { status: 304, headers: { ETag: tag } });

  const size = await hub.files.store.size(kind as StoredKind, row.id);
  if (size === null) {
    console.error(`Talk: the row of file ${row.id} is here but its ${kind} file is not`);
    notFound('attachmentNotFound');
  }

  const inline = kind === 'previews' || (row.is_image && !options.download);
  const type = kind === 'previews' ? row.preview_type! : inline ? row.content_type : 'application/octet-stream';
  return new Response(Readable.toWeb(hub.files.store.open(kind, row.id)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', row.file_name),
      ETag: tag,
      'Cache-Control': `private, max-age=${MAX_AGE}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  });
}

/** The Files page: everything sent and received, newest first. */
export async function sharedFiles(
  hub: TalkHub,
  userId: number,
  { filter, before, limit }: { filter: string | null; before: string | null; limit: number },
): Promise<FilesResponse> {
  const chosen = (filter ?? 'all') as FilesFilter;
  if (!['all', 'sent', 'received'].includes(chosen)) throw new ApiError('invalidInput', 400);
  const cursor = before ? decodeFilesCursor(before) : null;
  if (before && !cursor) throw new ApiError('invalidInput', 400);
  return listSharedFiles(hub.db, userId, { filter: chosen, before: cursor, limit });
}
