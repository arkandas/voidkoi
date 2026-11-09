import type { CallDirection, CallHistoryEntry, CallMedia, CallOutcome, CallSummary, CallsFilter } from '@/modules/talk/lib/protocol';

import type { Queryable } from './db';
import { personColumns, personFrom, toPerson } from './users';

export interface CallRow {
  id: number;
  conversation_id: number;
  caller_id: number;
  callee_id: number;
  media: CallMedia;
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  outcome: CallOutcome | null;
  callee_seen_at: Date | null;
}

const CALL_COLUMNS = 'id, conversation_id, caller_id, callee_id, media, started_at, answered_at, ended_at, outcome, callee_seen_at';

/** Connected time in whole seconds; 0 if never answered. */
export function callDurationSeconds(answeredAt: Date | null, endedAt: Date | null): number {
  if (!answeredAt || !endedAt) return 0;
  return Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
}

function toCallSummary(row: CallRow): CallSummary {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    media: row.media,
    startedAt: row.started_at.toISOString(),
    answeredAt: row.answered_at ? row.answered_at.toISOString() : null,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    outcome: row.outcome,
    durationSeconds: callDurationSeconds(row.answered_at, row.ended_at),
  };
}

export async function insertCall(db: Queryable, conversationId: number, callerId: number, calleeId: number, media: CallMedia = 'audio'): Promise<CallRow> {
  const { rows } = await db.query<CallRow>(
    `insert into talk_calls (conversation_id, caller_id, callee_id, media)
     values ($1, $2, $3, $4)
     returning ${CALL_COLUMNS}`,
    [conversationId, callerId, calleeId, media],
  );
  const row = rows[0];
  if (!row) throw new Error('insertCall: no row returned');
  return row;
}

/** The moment the callee picked up. */
export async function markCallAnswered(db: Queryable, callId: number): Promise<CallRow | null> {
  const { rows } = await db.query<CallRow>(
    `update talk_calls set answered_at = now()
      where id = $1 and answered_at is null and outcome is null
      returning ${CALL_COLUMNS}`,
    [callId],
  );
  return rows[0] ?? null;
}

/** How it ended. Written once: a hangup racing the ring timer can't overwrite whichever came first. */
export async function finishCall(db: Queryable, callId: number, outcome: CallOutcome): Promise<CallRow | null> {
  const { rows } = await db.query<CallRow>(
    `update talk_calls set outcome = $2, ended_at = now()
      where id = $1 and outcome is null
      returning ${CALL_COLUMNS}`,
    [callId, outcome],
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** Like the timeline's, the cursor keeps `at` as PostgreSQL wrote it, to the microsecond. */
export interface CallsCursor {
  at: string;
  id: number;
}

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function encodeCallsCursor(cursor: CallsCursor): string {
  return `${cursor.at}|${cursor.id}`;
}

export function decodeCallsCursor(raw: string): CallsCursor | null {
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  const [at, id] = parts as [string, string];
  const numericId = Number(id);
  if (!CURSOR_TIME.test(at)) return null;
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return { at, id: numericId };
}

interface CallHistoryRow extends CallRow {
  cursor_at: string;
}

const HISTORY_SQL = `
  select c.id, c.conversation_id, c.caller_id, c.callee_id, c.media, c.started_at,
         c.answered_at, c.ended_at, c.outcome, c.callee_seen_at,
         ${personColumns('ou', 'other_')},
         to_char(c.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USZ') as cursor_at
    from talk_calls c
    join users ou
      on ou.id = case when c.caller_id = $1 then c.callee_id else c.caller_id end
   where (c.caller_id = $1 or c.callee_id = $1)
     and c.outcome is not null
     and ($2::boolean = false
          or (c.callee_id = $1 and c.outcome in ('no_answer', 'cancelled')))
     -- Taken out of this person's log: one by one, or by clearing it.
     and not exists (
       select 1 from talk_call_hides h where h.call_id = c.id and h.user_id = $1
     )
     and c.id > $6
     and ($3::timestamptz is null or (c.started_at, c.id) < ($3::timestamptz, $4::integer))
   order by c.started_at desc, c.id desc
   limit $5`;

export interface CallHistoryPage {
  calls: CallHistoryEntry[];
  nextBefore: string | null;
}

export async function loadCallHistory(
  db: Queryable,
  userId: number,
  { filter, before, limit }: { filter: CallsFilter; before?: CallsCursor | null; limit: number },
): Promise<CallHistoryPage> {
  const { rows } = await db.query<CallHistoryRow>(HISTORY_SQL, [
    userId,
    filter === 'missed',
    before?.at ?? null,
    before?.id ?? null,
    limit + 1,
    await callsClearMark(db, userId),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];

  return {
    calls: page.map(row => toCallHistoryEntry(row, userId)),
    nextBefore: hasMore && oldest ? encodeCallsCursor({ at: oldest.cursor_at, id: oldest.id }) : null,
  };
}

function toCallHistoryEntry(row: CallHistoryRow, userId: number): CallHistoryEntry {
  const direction: CallDirection = row.caller_id === userId ? 'outgoing' : 'incoming';
  const missed = direction === 'incoming' && (row.outcome === 'no_answer' || row.outcome === 'cancelled');
  return {
    ...toCallSummary(row),
    direction,
    other: toPerson(personFrom(row as unknown as Record<string, unknown>, 'other_')!),
    missed,
    seen: !missed || row.callee_seen_at !== null,
  };
}

/** Missed calls not yet seen. One taken out of the log doesn't keep the badge lit. */
export async function countUnseenMissed(db: Queryable, userId: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n
       from talk_calls c
      where c.callee_id = $1
        and c.outcome in ('no_answer', 'cancelled')
        and c.callee_seen_at is null
        and not exists (
          select 1 from talk_call_hides h where h.call_id = c.id and h.user_id = $1
        )
        and c.id > $2`,
    [userId, await callsClearMark(db, userId)],
  );
  return rows[0]?.n ?? 0;
}

export async function markMissedCallsSeen(db: Queryable, userId: number): Promise<number> {
  const { rowCount } = await db.query(
    `update talk_calls set callee_seen_at = now()
      where callee_id = $1
        and outcome in ('no_answer', 'cancelled')
        and callee_seen_at is null`,
    [userId],
  );
  return rowCount;
}

/** Calls still ringing or going on, after the process that held them stopped. */
export async function abandonOpenCalls(db: Queryable): Promise<number> {
  const { rowCount } = await db.query(`update talk_calls set outcome = 'failed', ended_at = now() where outcome is null`);
  return rowCount;
}

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

/** The highest call id this person cleared their log past; zero if they never did. */
async function callsClearMark(db: Queryable, userId: number): Promise<number> {
  const { rows } = await db.query<{ cleared_before_call_id: number }>('select cleared_before_call_id from talk_users where user_id = $1', [userId]);
  return rows[0]?.cleared_before_call_id ?? 0;
}

/**
 * Take a call out of one person's log. Always one-sided: a call happened to
 * two people, and one of them tidying their list doesn't edit the other's.
 */
export async function hideCall(db: Queryable, callId: number, userId: number): Promise<boolean> {
  // Checked apart from the insert, so hiding one already hidden still succeeds.
  const { rows } = await db.query('select 1 from talk_calls where id = $1 and (caller_id = $2 or callee_id = $2)', [callId, userId]);
  if (rows.length === 0) return false;
  await db.query('insert into talk_call_hides (call_id, user_id) values ($1, $2) on conflict do nothing', [callId, userId]);
  return true;
}

/** Clear one person's whole log: one mark rather than a row for each call. */
export async function clearCallHistory(db: Queryable, userId: number): Promise<void> {
  await db.query(
    `insert into talk_users (user_id, cleared_before_call_id)
     values ($1, coalesce((select max(id) from talk_calls where caller_id = $1 or callee_id = $1), 0))
     on conflict (user_id) do update set cleared_before_call_id = excluded.cleared_before_call_id`,
    [userId],
  );
}
