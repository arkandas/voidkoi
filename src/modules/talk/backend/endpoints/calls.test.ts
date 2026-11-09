import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CallOutcome, CallsResponse } from '@/modules/talk/lib/protocol';

import { finishCall, insertCall, markCallAnswered } from '../calls';
import { getOrCreateDirectConversation } from '../conversations';
import type { TestDatabase } from '../test/database';
import { attempt, createTestContext, seedUser, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { callHistory, seeMissedCalls } from './calls';

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;

beforeAll(async () => {
  db = await testDatabase();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  ctx = await createTestContext(db);
  ada = await seedUser(ctx, 'ada', { name: 'Ada' });
  grace = await seedUser(ctx, 'grace', { name: 'Grace' });
  alan = await seedUser(ctx, 'alan', { name: 'Alan' });
});

afterEach(async () => {
  await ctx.close();
});

/** A finished call, `minutesAgo` in the past. */
async function recordCall(
  callerId: number,
  calleeId: number,
  outcome: CallOutcome,
  { minutesAgo = 0, durationSeconds = 0 }: { minutesAgo?: number; durationSeconds?: number } = {},
): Promise<number> {
  const conversation = await getOrCreateDirectConversation(db, callerId, calleeId);
  const call = await insertCall(db, conversation.id, callerId, calleeId);
  if (outcome === 'answered') await markCallAnswered(db, call.id);
  await finishCall(db, call.id, outcome);
  await db.query(
    `update talk_calls
        set started_at  = now() - ($2 || ' minutes')::interval,
            answered_at = case when $4 then now() - ($2 || ' minutes')::interval else null end,
            ended_at    = now() - ($2 || ' minutes')::interval + ($3 || ' seconds')::interval
      where id = $1`,
    [call.id, String(minutesAgo), String(durationSeconds), outcome === 'answered'],
  );
  return call.id;
}

const history = (user: TestUser, { filter = null as string | null, before = null as string | null, limit = 50 } = {}): Promise<CallsResponse> =>
  callHistory(ctx.hub, user.id, { filter, before, limit });

describe('the call log', () => {
  it('says which way each call went, who with, how long and how it ended', async () => {
    await recordCall(ada.id, grace.id, 'answered', { minutesAgo: 5, durationSeconds: 125 });
    await recordCall(alan.id, ada.id, 'declined', { minutesAgo: 2 });
    const { calls } = await history(ada);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ direction: 'incoming', outcome: 'declined', durationSeconds: 0, other: { id: alan.id, displayName: 'Alan' } });
    expect(calls[1]).toMatchObject({ direction: 'outgoing', outcome: 'answered', durationSeconds: 125, other: { id: grace.id, displayName: 'Grace' } });
  });

  it('is newest first, and only the calls of the person asking', async () => {
    await recordCall(ada.id, grace.id, 'answered', { minutesAgo: 30 });
    await recordCall(ada.id, grace.id, 'no_answer', { minutesAgo: 20 });
    await recordCall(grace.id, ada.id, 'declined', { minutesAgo: 10 });
    await recordCall(grace.id, alan.id, 'answered', { minutesAgo: 1, durationSeconds: 10 });
    expect((await history(ada)).calls.map(c => c.outcome)).toEqual(['declined', 'no_answer', 'answered']);
    expect((await history(alan)).calls).toHaveLength(1);
  });

  it('leaves out calls still going on', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertCall(db, conversation.id, ada.id, grace.id);
    expect((await history(ada)).calls).toHaveLength(0);
  });

  it('pages with a cursor', async () => {
    for (let i = 0; i < 7; i += 1) await recordCall(ada.id, grace.id, 'declined', { minutesAgo: 60 - i });
    const first = await history(ada, { limit: 3 });
    const second = await history(ada, { limit: 3, before: first.nextBefore });
    const third = await history(ada, { limit: 3, before: second.nextBefore });
    expect(third.calls).toHaveLength(1);
    expect(third.nextBefore).toBeNull();
    expect(new Set([...first.calls, ...second.calls, ...third.calls].map(c => c.id)).size).toBe(7);
  });

  it('refuses a bad filter or cursor', async () => {
    expect(await attempt(() => history(ada, { filter: 'weird' }))).toMatchObject({ status: 400 });
    expect(await attempt(() => history(ada, { before: 'nope' }))).toMatchObject({ status: 400 });
  });

  it('works out the duration from answered to ended', async () => {
    await recordCall(ada.id, grace.id, 'answered', { minutesAgo: 10, durationSeconds: 3661 });
    expect((await history(ada)).calls[0]!.durationSeconds).toBe(3661);
  });

  it('never rewrites how a call ended', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const call = await insertCall(db, conversation.id, ada.id, grace.id);
    expect(await finishCall(db, call.id, 'declined')).not.toBeNull();
    // A hangup racing the ring timer doesn't change history.
    expect(await finishCall(db, call.id, 'no_answer')).toBeNull();
    expect((await history(ada)).calls[0]!.outcome).toBe('declined');
  });
});

describe('missed calls', () => {
  it('are unanswered and cancelled incoming calls', async () => {
    await recordCall(grace.id, ada.id, 'no_answer', { minutesAgo: 4 });
    await recordCall(grace.id, ada.id, 'cancelled', { minutesAgo: 3 });
    await recordCall(grace.id, ada.id, 'declined', { minutesAgo: 2 });
    await recordCall(ada.id, grace.id, 'no_answer', { minutesAgo: 1 });
    const all = await history(ada);
    expect(all.calls).toHaveLength(4);
    expect(all.unseenMissed).toBe(2);
    const missed = await history(ada, { filter: 'missed' });
    expect(missed.calls.map(c => c.outcome).sort()).toEqual(['cancelled', 'no_answer']);
    expect(missed.calls.every(c => c.direction === 'incoming' && c.missed)).toBe(true);
  });

  it('badge only the callee, never the caller', async () => {
    await recordCall(ada.id, grace.id, 'no_answer', { minutesAgo: 1 });
    expect((await history(ada)).unseenMissed).toBe(0);
    expect((await history(ada)).calls[0]).toMatchObject({ direction: 'outgoing', missed: false });
    expect((await history(grace)).unseenMissed).toBe(1);
  });

  it('stop counting once seen, and stay in the log', async () => {
    await recordCall(grace.id, ada.id, 'no_answer', { minutesAgo: 1 });
    await seeMissedCalls(ctx.hub, ada.id);
    const after = await history(ada);
    expect(after.unseenMissed).toBe(0);
    expect(after.calls[0]).toMatchObject({ missed: true, seen: true });
  });
});
