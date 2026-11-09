import type { CallMedia, CallOutcome, ChatMessage, GroupEvent, GroupEventType, TimelineItem } from '@/modules/talk/lib/protocol';

import { attachmentsForMessages, toAttachment, type AttachmentRow } from './attachments';
import { callDurationSeconds } from './calls';
import type { Queryable } from './db';

export interface MessageRow {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  created_at: Date;
  deleted_at?: Date | null;
  event?: GroupEventType | null;
  event_user_id?: number | null;
  event_text?: string | null;
}

function toEvent(row: { event?: GroupEventType | null; event_user_id?: number | null; event_text?: string | null }): GroupEvent | null {
  return row.event ? { type: row.event, userId: row.event_user_id ?? null, text: row.event_text ?? null } : null;
}

export function toChatMessage(row: MessageRow, attachment: AttachmentRow | null = null): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
    event: toEvent(row),
    // A withdrawn message has no file either, even before the sweep gets to it.
    attachment: attachment && !row.deleted_at ? toAttachment(attachment) : null,
  };
}

export async function insertMessage(db: Queryable, conversationId: number, senderId: number, body: string): Promise<MessageRow> {
  const { rows } = await db.query<MessageRow>(
    `insert into talk_messages (conversation_id, sender_id, body)
     values ($1, $2, $3)
     returning id, conversation_id, sender_id, body, created_at`,
    [conversationId, senderId, body],
  );
  const row = rows[0];
  if (!row) throw new Error('insertMessage: no row returned');
  return row;
}

/** A notice in a group's timeline: "Ada added Grace". `actorId` is who did it. */
export async function insertEvent(db: Queryable, conversationId: number, actorId: number, event: GroupEvent): Promise<MessageRow> {
  const { rows } = await db.query<MessageRow>(
    `insert into talk_messages (conversation_id, sender_id, body, event, event_user_id, event_text)
     values ($1, $2, '', $3, $4, $5)
     returning id, conversation_id, sender_id, body, created_at, event, event_user_id, event_text`,
    [conversationId, actorId, event.type, event.userId, event.text],
  );
  return rows[0]!;
}

/* ------------------------------------------------------------------ */
/* The timeline: messages and calls together                           */
/* ------------------------------------------------------------------ */

/**
 * A page cursor. Messages and calls have their own id sequences, so it
 * carries the whole sort key: time, kind and id.
 *
 * `at` stays a string all the way round. PostgreSQL keeps timestamps to the
 * microsecond and a JavaScript `Date` only to the millisecond; rounding the
 * cursor would skip every row inside the rounded-away microsecond.
 */
export interface TimelineCursor {
  /** ISO-8601 UTC with microseconds, exactly as PostgreSQL wrote it. */
  at: string;
  kind: 'message' | 'call';
  id: number;
}

/** ISO-8601 in UTC, seconds with up to six decimals. */
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function encodeCursor(cursor: TimelineCursor): string {
  return `${cursor.at}|${cursor.kind}|${cursor.id}`;
}

export function decodeCursor(raw: string): TimelineCursor | null {
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const [at, kind, id] = parts as [string, string, string];
  const numericId = Number(id);
  if (!CURSOR_TIME.test(at)) return null;
  if (kind !== 'message' && kind !== 'call') return null;
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return { at, kind, id: numericId };
}

interface TimelineRow {
  kind: 'message' | 'call';
  id: number;
  at: Date;
  /** The same instant to the microsecond, for the next page's cursor. */
  cursor_at: string;
  sender_id: number | null;
  body: string | null;
  deleted_at: Date | null;
  event: GroupEventType | null;
  event_user_id: number | null;
  event_text: string | null;
  conversation_id: number;
  caller_id: number | null;
  callee_id: number | null;
  /** Audio or video. Named apart from the row's message-or-call `kind`. */
  call_media: CallMedia | null;
  answered_at: Date | null;
  ended_at: Date | null;
  outcome: CallOutcome | null;
}

/**
 * Messages and finished calls in one ordered stream. A UNION keeps the paging
 * honest: the limit applies to both together, so a page is never short
 * because one side ran out. `kind` breaks ties when a message and a call
 * share a timestamp.
 */
const TIMELINE_SQL = `
  select t.kind, t.id, t.at, t.conversation_id, t.sender_id, t.body, t.deleted_at,
         t.event, t.event_user_id, t.event_text,
         t.caller_id, t.callee_id, t.call_media, t.answered_at, t.ended_at, t.outcome,
         to_char(t.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USZ') as cursor_at
    from (
      select 'message'::text     as kind,
             m.id                as id,
             m.created_at        as at,
             m.conversation_id   as conversation_id,
             m.sender_id         as sender_id,
             m.body              as body,
             m.deleted_at        as deleted_at,
             m.event             as event,
             m.event_user_id     as event_user_id,
             m.event_text        as event_text,
             null::integer       as caller_id,
             null::integer       as callee_id,
             null::text          as call_media,
             null::timestamptz   as answered_at,
             null::timestamptz   as ended_at,
             null::text          as outcome
        from talk_messages m
       where m.conversation_id = $1
         and m.id > $7
         and ($9::integer is null or m.id <= $9)
         and not exists (
           select 1 from talk_message_hides h
            where h.message_id = m.id and h.user_id = $6
         )
      union all
      select 'call'::text,
             c.id,
             c.started_at,
             c.conversation_id,
             null::integer,
             null::text,
             null::timestamptz,
             null::text,
             null::integer,
             null::text,
             c.caller_id,
             c.callee_id,
             c.media,
             c.answered_at,
             c.ended_at,
             c.outcome
        from talk_calls c
       where c.conversation_id = $1
         and c.outcome is not null
         and c.id > $8
         and not exists (
           select 1 from talk_call_hides h
            where h.call_id = c.id and h.user_id = $6
         )
    ) t
   where $2::timestamptz is null
      or (t.at, t.kind, t.id) < ($2::timestamptz, $3::text, $4::integer)
   order by t.at desc, t.kind desc, t.id desc
   limit $5`;

export interface TimelinePage {
  /** Oldest first, so the page can add it straight to the bottom of the list. */
  items: TimelineItem[];
  /** Cursor for the next, older page, or null at the start. */
  nextBefore: string | null;
}

/**
 * One person's view of a conversation. What they hid, and everything before
 * they cleared the chat, isn't theirs to see: the same conversation can look
 * different to the people in it.
 */
export async function loadTimeline(
  db: Queryable,
  conversationId: number,
  viewerId: number,
  { before, limit }: { before?: TimelineCursor | null; limit: number },
): Promise<TimelinePage> {
  const marks = await clearMarks(db, conversationId, viewerId);

  // One more than asked for, to learn whether there is an older page.
  const { rows } = await db.query<TimelineRow>(TIMELINE_SQL, [
    conversationId,
    before?.at ?? null,
    before?.kind ?? null,
    before?.id ?? null,
    limit + 1,
    viewerId,
    marks.messages,
    marks.calls,
    marks.upTo,
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];
  const attachments = await attachmentsForMessages(
    db,
    page.filter(row => row.kind === 'message').map(row => row.id),
  );

  return {
    items: page.map(row => toTimelineItem(row, attachments.get(row.id) ?? null)).reverse(),
    nextBefore: hasMore && oldest ? encodeCursor({ at: oldest.cursor_at, kind: oldest.kind, id: oldest.id }) : null,
  };
}

function toTimelineItem(row: TimelineRow, attachment: AttachmentRow | null): TimelineItem {
  if (row.kind === 'message') {
    return {
      kind: 'message',
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id ?? 0,
      body: row.body ?? '',
      createdAt: row.at.toISOString(),
      deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
      event: toEvent(row),
      attachment: attachment && !row.deleted_at ? toAttachment(attachment) : null,
    };
  }
  return {
    kind: 'call',
    id: row.id,
    conversationId: row.conversation_id,
    callerId: row.caller_id ?? 0,
    calleeId: row.callee_id ?? 0,
    media: row.call_media ?? 'audio',
    startedAt: row.at.toISOString(),
    answeredAt: row.answered_at ? row.answered_at.toISOString() : null,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    outcome: row.outcome,
    durationSeconds: callDurationSeconds(row.answered_at, row.ended_at),
  };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** Move the read marker on. `greatest` keeps it from going back, so a late request can't bring a badge back. */
export async function markRead(db: Queryable, conversationId: number, userId: number, messageId: number): Promise<number> {
  const { rows } = await db.query<{ last_read_message_id: number }>(
    `update talk_members
        set last_read_message_id = greatest(last_read_message_id, $3)
      where conversation_id = $1 and user_id = $2
      returning last_read_message_id`,
    [conversationId, userId, messageId],
  );
  return rows[0]?.last_read_message_id ?? 0;
}

export async function latestMessageId(db: Queryable, conversationId: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>('select coalesce(max(id), 0)::int as id from talk_messages where conversation_id = $1', [
    conversationId,
  ]);
  return rows[0]?.id ?? 0;
}

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

/** Where this person's view of a conversation starts and, after leaving a group, ends. Zero for someone who never cleared it. */
async function clearMarks(db: Queryable, conversationId: number, userId: number): Promise<{ messages: number; calls: number; upTo: number | null }> {
  const { rows } = await db.query<{ messages_after: number; cleared_before_call_id: number; left_after_message_id: number | null }>(
    `select greatest(cleared_before_message_id, joined_after_message_id) as messages_after,
            cleared_before_call_id, left_after_message_id
       from talk_members
      where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
  const row = rows[0];
  return {
    messages: row?.messages_after ?? 0,
    calls: row?.cleared_before_call_id ?? 0,
    upTo: row?.left_after_message_id ?? null,
  };
}

/**
 * Withdraw a message from everyone. The text goes; the row stays. Only its
 * sender may, and only once: a second try changes nothing.
 */
export async function deleteMessageForEveryone(db: Queryable, messageId: number, senderId: number): Promise<MessageRow | null> {
  const { rows } = await db.query<MessageRow>(
    `update talk_messages
        set body = '', deleted_at = now(), deleted_by = $2
      where id = $1 and sender_id = $2 and deleted_at is null
      returning id, conversation_id, sender_id, body, created_at, deleted_at`,
    [messageId, senderId],
  );
  return rows[0] ?? null;
}

/** Take a message out of one person's copy. Anyone in the conversation may. */
export async function hideMessage(db: Queryable, messageId: number, userId: number): Promise<void> {
  await db.query('insert into talk_message_hides (message_id, user_id) values ($1, $2) on conflict do nothing', [messageId, userId]);
}

export async function findMessage(db: Queryable, messageId: number): Promise<MessageRow | null> {
  const { rows } = await db.query<MessageRow>(
    'select id, conversation_id, sender_id, body, created_at, deleted_at from talk_messages where id = $1',
    [messageId],
  );
  return rows[0] ?? null;
}

/** Clear one person's copy of a conversation: one mark, not a row for each message. What is said afterwards still arrives. */
export async function clearConversation(db: Queryable, conversationId: number, userId: number): Promise<void> {
  await db.query(
    `update talk_members
        set cleared_before_message_id =
              coalesce((select max(id) from talk_messages where conversation_id = $1), 0),
            cleared_before_call_id =
              coalesce((select max(id) from talk_calls where conversation_id = $1), 0)
      where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
}
