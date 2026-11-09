/**
 * Shared files on disk. The database says what a file is and who may see it;
 * this is where its bytes are:
 *
 *   <root>/files/ab/abXXXX…         the file as it was sent, named by its id
 *   <root>/previews/ab/abXXXX…      the small picture the sender's browser made
 *   <root>/group-photos/ab/abXX…    a group's photo, named by its photo id
 *   <root>/incoming/…               uploads still arriving
 *
 * An upload is written to `incoming` and moved into place once all of it has
 * arrived within the limit, so a half-written file is never served and a
 * failed one leaves nothing in the real folders.
 */
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type StoredKind = 'files' | 'previews' | 'group-photos';

export class TooLargeError extends Error {}

export interface Received {
  sizeBytes: number;
  /** The first bytes, enough to tell what kind of file it is. */
  head: Buffer;
}

/** How many leading bytes are kept for telling what a file is. */
const HEAD_BYTES = 64;

/** An upload untouched for this long will never finish. */
const STALE_MS = 60 * 60 * 1000;

/** 128 random bits, base64url: an attachment's id, and the name of its file. */
export function newFileId(): string {
  return randomBytes(16).toString('base64url');
}

/** Ids are only ever ones this server made; nothing else reaches a path. */
export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

export class FileStore {
  constructor(readonly root: string) {}

  async init(): Promise<void> {
    await Promise.all(['files', 'previews', 'group-photos', 'incoming'].map(dir => mkdir(join(/*turbopackIgnore: true*/ this.root, dir), { recursive: true })));
    await this.removeStaleIncoming();
  }

  path(kind: StoredKind, id: string): string {
    if (!isFileId(id)) throw new Error(`Not a file id: ${id}`);
    return join(/*turbopackIgnore: true*/ this.root, kind, id.slice(0, 2), id);
  }

  /** Write a stream to disk under `id`, refusing it once it passes `maxBytes`. Nothing stays unless all of it arrived. */
  async receive(kind: StoredKind, id: string, source: Readable, maxBytes: number): Promise<Received> {
    await mkdir(join(/*turbopackIgnore: true*/ this.root, 'incoming'), { recursive: true });
    const incoming = join(/*turbopackIgnore: true*/ this.root, 'incoming', `${id}.${randomBytes(4).toString('hex')}`);
    let sizeBytes = 0;
    const headChunks: Buffer[] = [];
    let headLength = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        sizeBytes += chunk.length;
        if (sizeBytes > maxBytes) {
          done(new TooLargeError(`larger than ${maxBytes} bytes`));
          return;
        }
        if (headLength < HEAD_BYTES) {
          headChunks.push(chunk.subarray(0, HEAD_BYTES - headLength));
          headLength += Math.min(chunk.length, HEAD_BYTES - headLength);
        }
        done(null, chunk);
      },
    });

    try {
      await pipeline(source, meter, createWriteStream(incoming, { flags: 'wx' }));
      await mkdir(join(/*turbopackIgnore: true*/ this.root, kind, id.slice(0, 2)), { recursive: true });
      await rename(incoming, this.path(kind, id));
    } catch (error) {
      await rm(incoming, { force: true });
      throw error;
    }
    return { sizeBytes, head: Buffer.concat(headChunks) };
  }

  async size(kind: StoredKind, id: string): Promise<number | null> {
    try {
      return (await stat(this.path(kind, id))).size;
    } catch {
      return null;
    }
  }

  open(kind: StoredKind, id: string): ReadStream {
    return createReadStream(this.path(kind, id));
  }

  /** The file and its preview. Already gone is fine: the end state is the same. */
  async remove(id: string): Promise<void> {
    await Promise.all([rm(this.path('files', id), { force: true }), rm(this.path('previews', id), { force: true })]);
  }

  async removeFrom(kind: StoredKind, id: string): Promise<void> {
    await rm(this.path(kind, id), { force: true });
  }

  /**
   * Every file older than `olderThanMs` in a folder, for finding files the
   * database no longer knows. A new one may still be getting its row.
   */
  async listIds(kind: StoredKind, olderThanMs = STALE_MS): Promise<string[]> {
    const ids: string[] = [];
    const base = join(/*turbopackIgnore: true*/ this.root, kind);
    const before = Date.now() - olderThanMs;
    for (const shard of await readdir(base).catch(() => [] as string[])) {
      for (const name of await readdir(join(/*turbopackIgnore: true*/ base, shard)).catch(() => [] as string[])) {
        if (!isFileId(name)) continue;
        const modified = await stat(join(/*turbopackIgnore: true*/ base, shard, name)).then(info => info.mtimeMs, () => Date.now());
        if (modified < before) ids.push(name);
      }
    }
    return ids;
  }

  /** Uploads that stopped arriving long ago. Recent ones may belong to another process. */
  private async removeStaleIncoming(): Promise<void> {
    const base = join(/*turbopackIgnore: true*/ this.root, 'incoming');
    const before = Date.now() - STALE_MS;
    for (const name of await readdir(base).catch(() => [] as string[])) {
      const path = join(/*turbopackIgnore: true*/ base, name);
      const modified = await stat(path).then(info => info.mtimeMs, () => Date.now());
      if (modified < before) await rm(path, { force: true });
    }
  }
}
