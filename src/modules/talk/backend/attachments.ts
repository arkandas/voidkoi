import type { Attachment, FilesFilter, SharedFile } from '@/modules/talk/lib/protocol';

import { groupSeenBy, visibleTo } from './conversations';
import type { Database, Queryable } from './db';
import { personColumns, personFrom, toPerson } from './users';

/** A row of `talk_attachments`. The bytes are on disk, named by `id`. */
export interface AttachmentRow {
  id: string;
  uploader_id: number;
  conversation_id: number;
  message_id: number | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  is_image: boolean;
  preview_type: string | null;
  width: number | null;
  height: number | null;
  created_at: Date;
}

const NAMES = [
  'id',
  'uploader_id',
  'conversation_id',
  'message_id',
  'file_name',
  'content_type',
  'size_bytes',
  'is_image',
  'preview_type',
  'width',
  'height',
  'created_at',
];

const COLUMNS = NAMES.join(', ');
const COLUMNS_OF_A = NAMES.map(name => `a.${name}`).join(', ');

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    isImage: row.is_image,
    hasPreview: row.preview_type !== null,
    width: row.width,
    height: row.height,
  };
}

export async function insertAttachment(
  db: Queryable,
  row: Pick<AttachmentRow, 'id' | 'uploader_id' | 'conversation_id' | 'file_name' | 'content_type' | 'size_bytes' | 'is_image'>,
): Promise<AttachmentRow> {
  const { rows } = await db.query<AttachmentRow>(
    `insert into talk_attachments (id, uploader_id, conversation_id, file_name, content_type, size_bytes, is_image)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${COLUMNS}`,
    [row.id, row.uploader_id, row.conversation_id, row.file_name, row.content_type, row.size_bytes, row.is_image],
  );
  return rows[0]!;
}

/** The bytes of every file an account has uploaded that is still kept: sent, or still waiting to be. */
export async function uploadedBytes(db: Queryable, userId: number): Promise<number> {
  const { rows } = await db.query<{ bytes: number | string }>(
    'select coalesce(sum(size_bytes), 0)::bigint as bytes from talk_attachments where uploader_id = $1',
    [userId],
  );
  return Number(rows[0]?.bytes ?? 0);
}

/**
 * Keep a new upload's row, unless the account's files would then add up to
 * more than `quota`: null then. Its other uploads ending at the same moment
 * wait their turn, so two can't both take the last of the room.
 */
export async function insertAttachmentWithin(
  db: Database,
  row: Parameters<typeof insertAttachment>[1],
  quota: number,
): Promise<AttachmentRow | null> {
  return db.transaction(async tx => {
    // Taken by each upload of the account in turn; anything else that only refers to the account isn't held up.
    await tx.query('select 1 from users where id = $1 for no key update', [row.uploader_id]);
    if ((await uploadedBytes(tx, row.uploader_id)) + row.size_bytes > quota) return null;
    return insertAttachment(tx, row);
  });
}

export async function findAttachment(db: Queryable, id: string): Promise<AttachmentRow | null> {
  const { rows } = await db.query<AttachmentRow>(`select ${COLUMNS} from talk_attachments where id = $1`, [id]);
  return rows[0] ?? null;
}

/** Keep the preview. Only while the upload is still its uploader's alone. */
export async function setPreview(
  db: Queryable,
  id: string,
  uploaderId: number,
  preview: { type: string; width: number; height: number },
): Promise<AttachmentRow | null> {
  const { rows } = await db.query<AttachmentRow>(
    `update talk_attachments set preview_type = $3, width = $4, height = $5
      where id = $1 and uploader_id = $2 and message_id is null
      returning ${COLUMNS}`,
    [id, uploaderId, preview.type, preview.width, preview.height],
  );
  return rows[0] ?? null;
}

/**
 * Tie an upload to the message that sends it: only its uploader, only in the
 * conversation it was uploaded for, and only once.
 */
export async function claimAttachment(
  db: Queryable,
  id: string,
  uploaderId: number,
  conversationId: number,
  messageId: number,
): Promise<AttachmentRow | null> {
  const { rows } = await db.query<AttachmentRow>(
    `update talk_attachments set message_id = $4
      where id = $1 and uploader_id = $2 and conversation_id = $3 and message_id is null
      returning ${COLUMNS}`,
    [id, uploaderId, conversationId, messageId],
  );
  return rows[0] ?? null;
}

/** The files of these messages, by message id. */
export async function attachmentsForMessages(db: Queryable, messageIds: readonly number[]): Promise<Map<number, AttachmentRow>> {
  if (messageIds.length === 0) return new Map();
  const { rows } = await db.query<AttachmentRow>(`select ${COLUMNS} from talk_attachments where message_id = any($1::int[])`, [messageIds]);
  return new Map(rows.map(row => [row.message_id!, row]));
}

/**
 * The attachment, if this person may see it: its uploader before it is sent;
 * afterwards, anyone in the conversation who still has it in their copy: not
 * withdrawn, not deleted for them, not cleared.
 */
export async function findVisibleAttachment(db: Queryable, id: string, userId: number): Promise<AttachmentRow | null> {
  const { rows } = await db.query<AttachmentRow>(
    `select ${COLUMNS_OF_A}
       from talk_attachments a
       left join talk_messages m on m.id = a.message_id
      where a.id = $1
        and (
          (a.message_id is null and a.uploader_id = $2)
          or (
            m.deleted_at is null
            and exists (
              select 1 from talk_members cm
               where cm.conversation_id = a.conversation_id
                 and cm.user_id = $2
                 and ${visibleTo('cm', 'm')}
            )
            and not exists (
              select 1 from talk_message_hides h where h.message_id = a.message_id and h.user_id = $2
            )
          )
        )`,
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function deleteAttachmentRows(db: Queryable, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.query('delete from talk_attachments where id = any($1::text[])', [ids]);
}

/**
 * Files nobody can see any more, whose bytes should go: uploaded and never
 * sent, a day on; withdrawn for everyone; or deleted or cleared by everyone in
 * the conversation, each from their own copy.
 */
export async function deadAttachmentIds(db: Queryable, unsentAfterHours = 24): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `select a.id
       from talk_attachments a
       left join talk_messages m on m.id = a.message_id
      where (a.message_id is null and a.created_at < now() - ($1 || ' hours')::interval)
         or m.deleted_at is not null
         or (
           a.message_id is not null
           and not exists (
             select 1 from talk_members cm
              where cm.conversation_id = a.conversation_id
                and ${visibleTo('cm', 'm')}
                and not exists (
                  select 1 from talk_message_hides h
                   where h.message_id = a.message_id and h.user_id = cm.user_id
                )
           )
         )`,
    [String(unsentAfterHours)],
  );
  return rows.map(row => row.id);
}

/** Every file an account uploaded, for removing them with it. */
export async function uploadedBy(db: Queryable, userId: number): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>('select id from talk_attachments where uploader_id = $1', [userId]);
  return rows.map(row => row.id);
}

/* ------------------------------------------------------------------ */
/* The Files page                                                       */
/* ------------------------------------------------------------------ */

export interface FilesCursor {
  /** ISO-8601 UTC with microseconds, exactly as PostgreSQL wrote it. */
  at: string;
  messageId: number;
}

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function encodeFilesCursor(cursor: FilesCursor): string {
  return `${cursor.at}|${cursor.messageId}`;
}

export function decodeFilesCursor(raw: string): FilesCursor | null {
  const [at, id, ...rest] = raw.split('|');
  const messageId = Number(id);
  if (rest.length > 0 || !at || !CURSOR_TIME.test(at)) return null;
  if (!Number.isInteger(messageId) || messageId <= 0) return null;
  return { at, messageId };
}

interface SharedFileRow extends AttachmentRow {
  shared_at: Date;
  cursor_at: string;
  group_name: string | null;
}

/**
 * Every file this person can still see, in every conversation and group,
 * newest first, by the same rules as the conversation itself.
 */
export async function listSharedFiles(
  db: Queryable,
  userId: number,
  { filter, before, limit }: { filter: FilesFilter; before: FilesCursor | null; limit: number },
): Promise<{ files: SharedFile[]; nextBefore: string | null }> {
  const { rows } = await db.query<SharedFileRow>(
    `select ${COLUMNS_OF_A},
            m.created_at as shared_at,
            to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USZ') as cursor_at,
            ${groupSeenBy('me', 'c').name} as group_name,
            ${personColumns('su', 'sender_')},
            ${personColumns('ou', 'other_')}
       from talk_members me
       join talk_conversations c on c.id = me.conversation_id
       join talk_attachments a on a.conversation_id = me.conversation_id and a.message_id is not null
       join talk_messages m on m.id = a.message_id
       join users su on su.id = m.sender_id
       left join lateral (
         select u.* from talk_members om
           join users u on u.id = om.user_id
          where c.is_direct and om.conversation_id = c.id and om.user_id <> me.user_id
          limit 1
       ) ou on true
      where me.user_id = $1
        and m.deleted_at is null
        and ${visibleTo('me', 'm')}
        and not exists (
          select 1 from talk_message_hides h where h.message_id = m.id and h.user_id = $1
        )
        and ($2 = 'all' or ($2 = 'sent') = (m.sender_id = $1))
        and ($3::timestamptz is null or (m.created_at, m.id) < ($3::timestamptz, $4::integer))
      order by m.created_at desc, m.id desc
      limit $5`,
    [userId, filter, before?.at ?? null, before?.messageId ?? null, limit + 1],
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    files: page.map(row => {
      const record = row as unknown as Record<string, unknown>;
      const other = personFrom(record, 'other_');
      return {
        ...toAttachment(row),
        messageId: row.message_id!,
        conversationId: row.conversation_id,
        direction: row.uploader_id === userId ? 'sent' : 'received',
        sender: toPerson(personFrom(record, 'sender_')!),
        other: other ? toPerson(other) : null,
        group: row.group_name === null ? null : { name: row.group_name },
        sharedAt: row.shared_at.toISOString(),
      };
    }),
    nextBefore: hasMore && last ? encodeFilesCursor({ at: last.cursor_at, messageId: last.message_id! }) : null,
  };
}
