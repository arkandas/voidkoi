/**
 * Keeping the files on disk and the rows about them in step.
 *
 * Deleting follows the conversation: withdrawing a file for everyone removes
 * it at once, and a file everyone has deleted from their own copy goes too,
 * since nobody can reach it any more. An upload never sent goes after a day.
 * What is deleted is deleted: the bytes go, not just the row.
 */
import { deadAttachmentIds, deleteAttachmentRows } from '../attachments';
import type { Queryable } from '../db';
import { deleteEmptyConversations } from '../groups';
import type { FileStore } from './store';

export class FileService {
  private pending: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Queryable,
    readonly store: FileStore,
    private readonly log: (message: string, error?: unknown) => void,
  ) {}

  /** Remove these files now, rows and bytes. */
  async discard(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    // Rows first: once the row is gone nothing serves the file, and one left
    // behind by a crash in between is found by the disk sweep.
    await deleteAttachmentRows(this.db, ids);
    await Promise.all(ids.map(id => this.store.remove(id)));
  }

  /** Remove every file nobody can see any more. Returns how many went. */
  sweep(): Promise<number> {
    this.running ??= (async () => {
      try {
        const empty = await deleteEmptyConversations(this.db);
        await Promise.all([
          ...empty.files.map(id => this.store.remove(id)),
          ...empty.photos.map(id => this.store.removeFrom('group-photos', id)),
        ]);
        const ids = await deadAttachmentIds(this.db);
        await this.discard(ids);
        return ids.length + empty.files.length;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** After a deletion: soon, and once for a burst of them. */
  sweepSoon(delayMs = 2000): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.sweep().catch(error => this.log('Talk: removing files nobody can see failed', error));
    }, delayMs);
    this.pending.unref();
  }

  /** Files on disk with no row at all, left by a crash between removing the row and the file. */
  async sweepDisk(): Promise<number> {
    let removed = 0;
    for (const [kind, query] of [
      ['files', 'select id from talk_attachments where id = any($1::text[])'],
      ['group-photos', 'select photo_id as id from talk_conversations where photo_id = any($1::text[])'],
    ] as const) {
      const onDisk = await this.store.listIds(kind);
      if (onDisk.length === 0) continue;
      const { rows } = await this.db.query<{ id: string }>(query, [onDisk]);
      const known = new Set(rows.map(row => row.id));
      const strays = onDisk.filter(id => !known.has(id));
      await Promise.all(strays.map(id => (kind === 'files' ? this.store.remove(id) : this.store.removeFrom(kind, id))));
      removed += strays.length;
    }
    return removed;
  }

  /** Sweep every hour. Returns a stop function. */
  start(intervalMs = 60 * 60 * 1000): () => void {
    const timer = setInterval(() => {
      void this.sweep()
        .then(removed => {
          if (removed > 0) console.log(`Talk: removed ${removed} file(s) nobody can see`);
        })
        .catch(error => this.log('Talk: removing files nobody can see failed', error));
    }, intervalMs);
    timer.unref();
    return () => {
      clearInterval(timer);
      if (this.pending) clearTimeout(this.pending);
    };
  }
}
