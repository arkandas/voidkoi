import type { ConversationSummary, GroupEventType, GroupInfo, UserStatus } from '@/modules/talk/lib/protocol';

import { PG_UNIQUE_VIOLATION, isPgError, type Database, type Queryable } from './db';
import { personColumns, personFrom, toDirectoryUser, type UserRow } from './users';

export interface ConversationRow {
  id: number;
  is_direct: boolean;
  direct_key: string | null;
  /** A group's name and owner; null for a 1:1 conversation. */
  name?: string | null;
  owner_id?: number | null;
  created_at: Date;
}

export async function findConversation(db: Queryable, id: number): Promise<ConversationRow | null> {
  const { rows } = await db.query<ConversationRow>(
    'select id, is_direct, direct_key, name, owner_id, created_at from talk_conversations where id = $1',
    [id],
  );
  return rows[0] ?? null;
}

/** A row of the conversation list. */
export interface ConversationSummaryRow {
  id: number;
  is_direct: boolean;
  group_name: string | null;
  owner_id: number | null;
  group_photo_id: string | null;
  /** When the person asking left this group, or null while they are in it. */
  my_left_at: Date | null;
  /** The other person of a 1:1 conversation, under `other_`; all null for a group. */
  other_id: number | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_key: string | null;
  last_message: string | null;
  last_message_deleted_at: Date | null;
  last_sender_id: number | null;
  last_event: GroupEventType | null;
  last_event_user_id: number | null;
  last_event_text: string | null;
  /** When the last message is a file: its name, and whether it is a picture. */
  last_attachment_name: string | null;
  last_attachment_is_image: boolean | null;
  last_message_at: Date | null;
  last_activity_at: Date;
  unread_count: number;
}

/**
 * The messages a member may read, as SQL: after they joined and after they
 * last cleared the chat, and, once they have left, not past the notice that
 * they left. `member` and `message` are the aliases in the query it goes in.
 */
export function visibleTo(member: string, message: string): string {
  return `${message}.id > greatest(${member}.cleared_before_message_id, ${member}.joined_after_message_id)
    and (${member}.left_after_message_id is null or ${message}.id <= ${member}.left_after_message_id)`;
}

/**
 * A group as one of its members sees it, as SQL: as it is now while they are
 * in it; once they have left, as it was when they left. Their window closes
 * at the notice that they left, so the name and the owner are the ones the
 * notices up to it say, and the photo is only theirs while it is still the
 * one they saw. `member` is their `talk_members` row and `group` the
 * conversation, the aliases in the query it goes in.
 */
export function groupSeenBy(member: string, group: string): { name: string; ownerId: string; photoId: string; photoType: string } {
  const until = `${member}.left_after_message_id`;
  const notices = (events: string): string =>
    `from talk_messages e where e.conversation_id = ${group}.id and e.event in (${events}) and e.id <= ${until} order by e.id desc limit 1`;
  const photoSeen = `(${until} is null or (
      (select e.event_text is null ${notices("'photo'")})
      and not exists (select 1 from talk_messages e where e.conversation_id = ${group}.id and e.event = 'photo' and e.id > ${until})
    ))`;
  return {
    name: `case when ${until} is null then ${group}.name
                else coalesce((select e.event_text ${notices("'created', 'renamed'")}), '') end`,
    ownerId: `case when ${until} is null then ${group}.owner_id
                   else (select case when e.event = 'owner' then e.event_user_id else e.sender_id end ${notices("'created', 'owner'")}) end`,
    photoId: `case when ${photoSeen} then ${group}.photo_id end`,
    photoType: `case when ${photoSeen} then ${group}.photo_type end`,
  };
}

/**
 * Whether `member` is in the group as `viewer` sees it, as SQL: true for
 * someone in it, false for someone who was and left, null for someone the
 * viewer never saw there. A viewer still in it sees everyone as they are now.
 * One who has left sees them as they were then: from their rows, and for
 * anyone who came back or came in since, from their comings and goings.
 */
function memberSeenBy(viewer: string, member: string): string {
  const until = `${viewer}.left_after_message_id`;
  const change = `e.conversation_id = ${member}.conversation_id
          and ((e.event in ('added', 'removed') and e.event_user_id = ${member}.user_id)
               or (e.event = 'left' and e.sender_id = ${member}.user_id))`;
  return `case
    when ${until} is null then ${member}.left_at is null
    when ${member}.joined_after_message_id < ${until}
      then ${member}.left_after_message_id is null or ${member}.left_after_message_id > ${until}
    else coalesce(
      -- The last change to them the viewer saw: added, or gone.
      (select e.event = 'added' from talk_messages e where ${change} and e.id <= ${until} order by e.id desc limit 1),
      -- None: in it from the start, if the first change since was going rather than coming.
      (select case when e.event <> 'added' then true end from talk_messages e where ${change} and e.id > ${until} order by e.id limit 1),
      -- Or if they said something there the viewer read.
      (select true from talk_messages e
        where e.conversation_id = ${member}.conversation_id and e.id <= ${until} and e.sender_id = ${member}.user_id
        limit 1))
  end`;
}

/** The pair's key, which the unique index on `direct_key` holds to one conversation. Sorted, so it doesn't matter who opened it. */
export function directKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * The 1:1 conversation of a pair, made on first use. Two browsers opening the
 * same chat at once both get here; one insert wins and the other reads its row.
 */
export async function getOrCreateDirectConversation(db: Database, userA: number, userB: number): Promise<ConversationRow> {
  if (userA === userB) throw new Error('getOrCreateDirectConversation: needs two people');
  const key = directKey(userA, userB);

  const existing = await findDirectConversation(db, key);
  if (existing) return existing;

  try {
    return await db.transaction(async tx => {
      const { rows } = await tx.query<ConversationRow>(
        `insert into talk_conversations (is_direct, direct_key) values (true, $1)
         returning id, is_direct, direct_key, created_at`,
        [key],
      );
      const conversation = rows[0];
      if (!conversation) throw new Error('conversation insert returned no row');
      await tx.query('insert into talk_members (conversation_id, user_id) values ($1, $2), ($1, $3)', [conversation.id, userA, userB]);
      return conversation;
    });
  } catch (error) {
    // Lost the race: the other one made it, so read it back.
    if (isPgError(error, PG_UNIQUE_VIOLATION)) {
      const winner = await findDirectConversation(db, key);
      if (winner) return winner;
    }
    throw error;
  }
}

async function findDirectConversation(db: Queryable, key: string): Promise<ConversationRow | null> {
  const { rows } = await db.query<ConversationRow>(
    'select id, is_direct, direct_key, created_at from talk_conversations where direct_key = $1',
    [key],
  );
  return rows[0] ?? null;
}

/** Whether this person has the conversation at all, a group they left included: they may still read it. */
export async function isMember(db: Queryable, conversationId: number, userId: number): Promise<boolean> {
  const { rows } = await db.query('select 1 from talk_members where conversation_id = $1 and user_id = $2', [conversationId, userId]);
  return rows.length === 1;
}

/** Whether this person is in it now, and so may write in it. */
export async function isActiveMember(db: Queryable, conversationId: number, userId: number): Promise<boolean> {
  const { rows } = await db.query('select 1 from talk_members where conversation_id = $1 and user_id = $2 and left_at is null', [
    conversationId,
    userId,
  ]);
  return rows.length === 1;
}

/** Who is in it now: who a new message goes to. With `everyone`, former members of a group too. */
export async function listMemberIds(db: Queryable, conversationId: number, { everyone = false }: { everyone?: boolean } = {}): Promise<number[]> {
  const { rows } = await db.query<{ user_id: number }>(
    `select user_id from talk_members
      where conversation_id = $1 ${everyone ? '' : 'and left_at is null'}
      order by user_id`,
    [conversationId],
  );
  return rows.map(row => row.user_id);
}

/**
 * One row for each conversation of a person: the other person of a 1:1
 * conversation, the last message and the unread count, newest activity first.
 * A finished call counts as activity, so a conversation that only had a call
 * today doesn't sink below one whose last message was a week ago. A group
 * they left is as it was when they left.
 */
const SEEN = groupSeenBy('me', 'c');
const SUMMARY_SQL = `
  select c.id,
         c.is_direct,
         ${SEEN.name}     as group_name,
         ${SEEN.ownerId}  as owner_id,
         ${SEEN.photoId}  as group_photo_id,
         me.left_at       as my_left_at,
         ${personColumns('ou', 'other_')},
         lm.body          as last_message,
         lm.deleted_at    as last_message_deleted_at,
         lm.sender_id     as last_sender_id,
         lm.event         as last_event,
         lm.event_user_id as last_event_user_id,
         lm.event_text    as last_event_text,
         la.file_name     as last_attachment_name,
         la.is_image      as last_attachment_is_image,
         lm.created_at    as last_message_at,
         greatest(
           me.joined_at,
           coalesce(lm.created_at, me.joined_at),
           coalesce(lc.started_at, me.joined_at)
         )              as last_activity_at,
         coalesce(unread.n, 0) as unread_count
    from talk_members me
    join talk_conversations c on c.id = me.conversation_id
    -- The other person, for a 1:1 conversation only.
    left join lateral (
      select u.* from talk_members om
        join users u on u.id = om.user_id
       where c.is_direct and om.conversation_id = c.id and om.user_id <> me.user_id
       limit 1
    ) ou on true
    -- The preview is this person's: their deletions apply, and so does where
    -- they cleared the chat and, in a group, when they joined and left.
    left join lateral (
      select m.id, m.body, m.created_at, m.deleted_at, m.sender_id,
             m.event, m.event_user_id, m.event_text
        from talk_messages m
       where m.conversation_id = c.id
         and ${visibleTo('me', 'm')}
         and not exists (
           select 1 from talk_message_hides h
            where h.message_id = m.id and h.user_id = me.user_id
         )
       order by m.created_at desc, m.id desc
       limit 1
    ) lm on true
    left join talk_attachments la on la.message_id = lm.id
    left join lateral (
      select cl.started_at
        from talk_calls cl
       where cl.conversation_id = c.id and cl.outcome is not null
         and cl.id > me.cleared_before_call_id
         and not exists (
           select 1 from talk_call_hides h
            where h.call_id = cl.id and h.user_id = me.user_id
         )
       order by cl.started_at desc, cl.id desc
       limit 1
    ) lc on true
    -- A message deleted from this person's copy can't leave a badge pointing
    -- at something they can no longer open. A group notice is news, not a
    -- message waiting to be read.
    left join lateral (
      select count(*)::int as n
        from talk_messages m
       where m.conversation_id = c.id
         and m.sender_id <> me.user_id
         and m.id > me.last_read_message_id
         and ${visibleTo('me', 'm')}
         and m.deleted_at is null
         and m.event is null
         and not exists (
           select 1 from talk_message_hides h
            where h.message_id = m.id and h.user_id = me.user_id
         )
    ) unread on true
   where me.user_id = $1
     -- Deleted from this person's list, and nothing new since.
     and me.removed_at is null`;

export async function listConversationSummaries(db: Queryable, userId: number): Promise<ConversationSummaryRow[]> {
  const { rows } = await db.query<ConversationSummaryRow>(`${SUMMARY_SQL} order by last_activity_at desc, c.id desc`, [userId]);
  return rows;
}

export async function getConversationSummary(db: Queryable, userId: number, conversationId: number): Promise<ConversationSummaryRow | null> {
  const { rows } = await db.query<ConversationSummaryRow>(`${SUMMARY_SQL} and c.id = $2`, [userId, conversationId]);
  return rows[0] ?? null;
}

/** The unread messages of every conversation of a person, added up. */
export async function totalUnread(db: Queryable, userId: number): Promise<number> {
  const rows = await listConversationSummaries(db, userId);
  return rows.reduce((sum, row) => sum + Number(row.unread_count), 0);
}

export interface GroupMemberRow extends UserRow {
  conversation_id: number;
  /** In the group, as the person asking sees it. */
  active: boolean;
}

/**
 * Everyone who is or was in these groups, as the person asking sees them:
 * as they are now in a group they are in, as they were when they left one.
 * Current members first, then by who joined first.
 */
async function listGroupMembers(db: Queryable, viewerId: number, conversationIds: readonly number[]): Promise<Map<number, GroupMemberRow[]>> {
  const byGroup = new Map<number, GroupMemberRow[]>();
  if (conversationIds.length === 0) return byGroup;
  const { rows } = await db.query<GroupMemberRow>(
    `select cm.conversation_id, seen.active, ${personColumns('u')}
       from talk_members me
       join talk_conversations c on c.id = me.conversation_id and not c.is_direct
       join talk_members cm on cm.conversation_id = me.conversation_id
       join users u on u.id = cm.user_id
       cross join lateral (select ${memberSeenBy('me', 'cm')} as active) seen
      where me.user_id = $1 and me.conversation_id = any($2::int[])
        and seen.active is not null
      order by seen.active desc, cm.joined_at, u.id`,
    [viewerId, conversationIds],
  );
  for (const row of rows) {
    const list = byGroup.get(row.conversation_id) ?? [];
    list.push(row);
    byGroup.set(row.conversation_id, list);
  }
  return byGroup;
}

export function toConversationSummary(
  row: ConversationSummaryRow,
  statusOf: (userId: number) => UserStatus,
  members: readonly GroupMemberRow[] = [],
): ConversationSummary {
  const other = row.is_direct ? personFrom(row as unknown as Record<string, unknown>, 'other_') : null;
  const group: GroupInfo | null = row.is_direct
    ? null
    : {
        name: row.group_name ?? '',
        photoVersion: row.group_photo_id,
        ownerId: row.owner_id,
        active: row.my_left_at === null,
        members: members.map(member => ({ ...toDirectoryUser(member, statusOf(member.id)), active: member.active })),
      };
  return {
    id: row.id,
    kind: row.is_direct ? 'direct' : 'group',
    other: other ? toDirectoryUser(other, statusOf(other.id)) : null,
    group,
    // A withdrawn message has no text left; the list says what happened instead.
    lastMessage: row.last_message_deleted_at ? null : row.last_message,
    lastMessageDeleted: row.last_message_deleted_at !== null,
    lastSenderId: row.last_sender_id,
    lastEvent: row.last_event ? { type: row.last_event, userId: row.last_event_user_id, text: row.last_event_text } : null,
    lastAttachment:
      row.last_attachment_name === null ? null : { name: row.last_attachment_name, isImage: row.last_attachment_is_image === true },
    lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
    lastActivityAt: row.last_activity_at.toISOString(),
    unreadCount: row.unread_count,
  };
}

/** One person's summaries with their groups' members: what the list and a single conversation send. */
export async function summarize(
  db: Queryable,
  viewerId: number,
  rows: readonly ConversationSummaryRow[],
  statusOf: (userId: number) => UserStatus,
): Promise<ConversationSummary[]> {
  const members = await listGroupMembers(
    db,
    viewerId,
    rows.filter(row => !row.is_direct).map(row => row.id),
  );
  return rows.map(row => toConversationSummary(row, statusOf, members.get(row.id) ?? []));
}

/** Take a conversation out of one person's list: clear their copy and hide it. Nobody else's changes. */
export async function removeConversation(db: Queryable, conversationId: number, userId: number): Promise<void> {
  await db.query(
    `update talk_members
        set cleared_before_message_id =
              coalesce((select max(id) from talk_messages where conversation_id = $1), 0),
            cleared_before_call_id =
              coalesce((select max(id) from talk_calls where conversation_id = $1), 0),
            removed_at = now()
      where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
}

/**
 * Put a deleted conversation back in the list: for everyone in it when a new
 * message arrives, or for one person who starts it again. It comes back
 * empty; what was deleted stays deleted.
 */
export async function restoreConversation(db: Queryable, conversationId: number, userId?: number): Promise<void> {
  if (userId === undefined) {
    // Only for the people in it now: a group someone has left and deleted stays deleted.
    await db.query(
      `update talk_members set removed_at = null
        where conversation_id = $1 and removed_at is not null and left_at is null`,
      [conversationId],
    );
  } else {
    await db.query(
      `update talk_members set removed_at = null
        where conversation_id = $1 and user_id = $2 and removed_at is not null`,
      [conversationId, userId],
    );
  }
}
