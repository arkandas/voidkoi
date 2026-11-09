/**
 * Groups: conversations that are not direct, with a name, an owner, and
 * members who come and go.
 *
 * A member's window is two message ids on their row: `joined_after_message_id`
 * (they read what came after it) and, once they leave, `left_after_message_id`
 * (they read up to and including the notice that they left). Leaving keeps the
 * row, so the group stays in their list, read-only, until they delete it.
 */
import { groupSeenBy } from './conversations';
import type { Queryable } from './db';
import { latestMessageId } from './messages';

export interface GroupRow {
  id: number;
  name: string;
  owner_id: number | null;
  /** The file under group-photos, and its type; null without a photo. */
  photo_id: string | null;
  photo_type: string | null;
}

export async function findGroup(db: Queryable, id: number): Promise<GroupRow | null> {
  const { rows } = await db.query<GroupRow>(
    'select id, name, owner_id, photo_id, photo_type from talk_conversations where id = $1 and not is_direct',
    [id],
  );
  return rows[0] ?? null;
}

/**
 * The group's photo as this member sees it: the one up now while they are in
 * it; after they left, the one they saw, only while it is still up. Null
 * without one, and for anyone who was never in the group.
 */
export async function findGroupPhotoSeenBy(db: Queryable, groupId: number, userId: number): Promise<{ id: string; type: string } | null> {
  const seen = groupSeenBy('me', 'c');
  const { rows } = await db.query<{ id: string | null; type: string | null }>(
    `select ${seen.photoId} as id, ${seen.photoType} as type
       from talk_members me
       join talk_conversations c on c.id = me.conversation_id and not c.is_direct
      where me.conversation_id = $1 and me.user_id = $2`,
    [groupId, userId],
  );
  const row = rows[0];
  return row?.id && row.type ? { id: row.id, type: row.type } : null;
}

export async function insertGroup(db: Queryable, name: string, ownerId: number, memberIds: readonly number[]): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'insert into talk_conversations (is_direct, name, owner_id) values (false, $1, $2) returning id',
    [name, ownerId],
  );
  const id = rows[0]!.id;
  await db.query(
    `insert into talk_members (conversation_id, user_id)
     select $1, unnest($2::int[])`,
    [id, [ownerId, ...memberIds]],
  );
  return id;
}

/**
 * Put people in a group: new rows for newcomers, and a fresh start for anyone
 * who had left. Either way they read from here on. Returns who was added.
 */
export async function addMembers(db: Queryable, conversationId: number, userIds: readonly number[]): Promise<number[]> {
  const from = await latestMessageId(db, conversationId);
  const { rows } = await db.query<{ user_id: number }>(
    `insert into talk_members (conversation_id, user_id, joined_after_message_id)
     select $1, unnest($2::int[]), $3
     on conflict (conversation_id, user_id) do update
        set left_at = null,
            left_after_message_id = null,
            removed_at = null,
            joined_at = now(),
            joined_after_message_id = excluded.joined_after_message_id,
            last_read_message_id = excluded.joined_after_message_id
      where talk_members.left_at is not null
     returning user_id`,
    [conversationId, userIds, from],
  );
  return rows.map(row => row.user_id);
}

/** Close someone's window at the notice that they left or were removed. */
export async function markLeft(db: Queryable, conversationId: number, userId: number, noticeId: number): Promise<void> {
  await db.query(
    `update talk_members set left_at = now(), left_after_message_id = $3
      where conversation_id = $1 and user_id = $2 and left_at is null`,
    [conversationId, userId, noticeId],
  );
}

/** The longest-standing member still in it, other than `except`: who inherits the group. */
export async function nextOwner(db: Queryable, conversationId: number, except: number): Promise<number | null> {
  const { rows } = await db.query<{ user_id: number }>(
    `select user_id from talk_members
      where conversation_id = $1 and left_at is null and user_id <> $2
      order by joined_at, user_id
      limit 1`,
    [conversationId, except],
  );
  return rows[0]?.user_id ?? null;
}

export async function setOwner(db: Queryable, conversationId: number, ownerId: number | null): Promise<void> {
  await db.query('update talk_conversations set owner_id = $2 where id = $1', [conversationId, ownerId]);
}

/** Point the group at a new photo file, or at none. */
export async function setGroupPhoto(db: Queryable, conversationId: number, photo: { id: string; type: string } | null): Promise<void> {
  await db.query('update talk_conversations set photo_id = $2, photo_type = $3 where id = $1', [
    conversationId,
    photo?.id ?? null,
    photo?.type ?? null,
  ]);
}

export async function renameGroup(db: Queryable, conversationId: number, name: string): Promise<void> {
  await db.query('update talk_conversations set name = $2 where id = $1', [conversationId, name]);
}

export async function countActiveMembers(db: Queryable, conversationId: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    'select count(*)::int as n from talk_members where conversation_id = $1 and left_at is null',
    [conversationId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * The group, gone for everyone: its members, messages and the rows about its
 * files go with it. Returns its files' ids, whose bytes the caller removes.
 */
export async function deleteGroup(db: Queryable, conversationId: number): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>('select id from talk_attachments where conversation_id = $1', [conversationId]);
  await db.query('delete from talk_conversations where id = $1 and not is_direct', [conversationId]);
  return rows.map(row => row.id);
}

/**
 * Conversations with nobody left in them, after the accounts of everyone in
 * them were deleted: gone, with their messages and calls. Returns the files
 * and group photos whose bytes the caller removes.
 */
export async function deleteEmptyConversations(db: Queryable): Promise<{ files: string[]; photos: string[] }> {
  const { rows } = await db.query<{ id: number; photo_id: string | null }>(
    `select c.id, c.photo_id from talk_conversations c
      where not exists (select 1 from talk_members m where m.conversation_id = c.id)
        -- Old enough that nothing is still adding people to it.
        and c.created_at < now() - interval '1 hour'`,
  );
  if (rows.length === 0) return { files: [], photos: [] };
  const ids = rows.map(row => row.id);
  const files = await db.query<{ id: string }>('select id from talk_attachments where conversation_id = any($1::int[])', [ids]);
  await db.query('delete from talk_conversations where id = any($1::int[])', [ids]);
  return { files: files.rows.map(row => row.id), photos: rows.flatMap(row => (row.photo_id ? [row.photo_id] : [])) };
}
