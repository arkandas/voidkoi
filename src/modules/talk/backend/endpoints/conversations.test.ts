import { Readable } from 'node:stream';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TimelineResponse } from '@/modules/talk/lib/protocol';

import { finishCall, insertCall, markCallAnswered } from '../calls';
import { directKey, getOrCreateDirectConversation } from '../conversations';
import { isPgError, PG_UNIQUE_VIOLATION } from '../db';
import { insertMessage } from '../messages';
import type { TestDatabase } from '../test/database';
import { attempt, createTestContext, seedUser, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { TestSocket } from '../test/socket';
import { callHistory, clearCalls, deleteCall } from './calls';
import { clearChat, conversationWith, deleteConversation, deleteMessage, listConversations, readConversation, timeline } from './conversations';
import { sharedFiles, upload } from './files';
import { pageLimit } from './http';

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;
const sockets: TestSocket[] = [];

beforeAll(async () => {
  db = await testDatabase();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  ctx = await createTestContext(db, { listen: true });
  ada = await seedUser(ctx, 'ada', { name: 'Ada' });
  grace = await seedUser(ctx, 'grace', { name: 'Grace' });
  alan = await seedUser(ctx, 'alan', { name: 'Alan' });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ctx.close();
});

async function connect(user: TestUser): Promise<TestSocket> {
  const socket = await TestSocket.connect(ctx.baseUrl!, user.cookie);
  sockets.push(socket);
  await socket.waitFor('welcome');
  return socket;
}

const page = (user: TestUser, conversationId: number, { before = null as string | null, limit = 50 } = {}) =>
  timeline(ctx.hub, user.id, conversationId, { before, limit });

const bodies = (result: TimelineResponse): string[] => result.items.filter(item => item.kind === 'message').map(item => item.body);

describe('one conversation per pair', () => {
  it('is the same whichever side asks', async () => {
    const fromAda = await conversationWith(ctx.hub, ada.id, grace.id);
    const fromGrace = await conversationWith(ctx.hub, grace.id, ada.id);
    expect(fromAda.conversation.id).toBe(fromGrace.conversation.id);
    expect((await db.query('select 1 from talk_conversations')).rows).toHaveLength(1);
  });

  it('is held by the database, not only the code', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    expect(conversation.direct_key).toBe(directKey(ada.id, grace.id));
    let error: unknown;
    try {
      await db.query('insert into talk_conversations (is_direct, direct_key) values (true, $1)', [directKey(ada.id, grace.id)]);
    } catch (caught) {
      error = caught;
    }
    expect(isPgError(error, PG_UNIQUE_VIOLATION)).toBe(true);
  });

  it('sorts the pair key, so it doesn’t depend on who started the chat', () => {
    expect(directKey(3, 9)).toBe('3:9');
    expect(directKey(9, 3)).toBe('3:9');
  });

  it('survives two browsers opening the same chat at once', async () => {
    const [a, b, c] = await Promise.all([
      getOrCreateDirectConversation(db, ada.id, grace.id),
      getOrCreateDirectConversation(db, grace.id, ada.id),
      getOrCreateDirectConversation(db, ada.id, grace.id),
    ]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
  });

  it('refuses a conversation with yourself, someone unknown, or someone who doesn’t use Talk', async () => {
    const notes = await seedUser(ctx, 'notes', { apps: ['notes'] });
    expect(await attempt(() => conversationWith(ctx.hub, ada.id, ada.id))).toMatchObject({ status: 400, code: 'cannotTalkToYourself' });
    expect(await attempt(() => conversationWith(ctx.hub, ada.id, 99999))).toMatchObject({ status: 404, code: 'userNotFound' });
    expect(await attempt(() => conversationWith(ctx.hub, ada.id, notes.id))).toMatchObject({ status: 404 });
  });
});

describe('the conversation list', () => {
  it('shows the other person, the last message and the unread count', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertMessage(db, conversation.id, grace.id, 'first');
    await insertMessage(db, conversation.id, grace.id, 'second');

    const list = await listConversations(ctx.hub, ada.id);
    expect(list.conversations).toHaveLength(1);
    expect(list.conversations[0]).toMatchObject({ id: conversation.id, lastMessage: 'second', unreadCount: 2 });
    expect(list.conversations[0]!.other).toMatchObject({ id: grace.id, displayName: 'Grace', username: 'grace', status: 'offline' });
    expect(list.totalUnread).toBe(2);
  });

  it('shows who is online', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertMessage(db, conversation.id, grace.id, 'hi');
    await connect(grace);
    expect((await listConversations(ctx.hub, ada.id)).conversations[0]!.other!.status).toBe('online');
  });

  it('doesn’t count your own messages as unread', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertMessage(db, conversation.id, ada.id, 'mine');
    expect((await listConversations(ctx.hub, ada.id)).totalUnread).toBe(0);
  });

  it('clears the unread count when read, and never moves the marker back', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const first = await insertMessage(db, conversation.id, grace.id, 'one');
    const second = await insertMessage(db, conversation.id, grace.id, 'two');
    await readConversation(ctx.hub, ada.id, conversation.id, second.id);
    await readConversation(ctx.hub, ada.id, conversation.id, first.id);
    expect((await listConversations(ctx.hub, ada.id)).totalUnread).toBe(0);
  });

  it('reads everything when no message is named', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertMessage(db, conversation.id, grace.id, 'one');
    await insertMessage(db, conversation.id, grace.id, 'two');
    await readConversation(ctx.hub, ada.id, conversation.id, null);
    expect((await listConversations(ctx.hub, ada.id)).totalUnread).toBe(0);
  });

  it('orders by the latest activity, calls included', async () => {
    const withGrace = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const withAlan = await getOrCreateDirectConversation(db, ada.id, alan.id);
    await db.query("insert into talk_messages (conversation_id, sender_id, body, created_at) values ($1, $2, 'old', now() - interval '2 days')", [
      withGrace.id,
      grace.id,
    ]);
    await db.query("update talk_members set joined_at = now() - interval '3 days'");
    const call = await insertCall(db, withAlan.id, alan.id, ada.id);
    await finishCall(db, call.id, 'declined');
    expect((await listConversations(ctx.hub, ada.id)).conversations.map(c => c.id)).toEqual([withAlan.id, withGrace.id]);
  });

  it('doesn’t show other people’s conversations', async () => {
    await getOrCreateDirectConversation(db, grace.id, alan.id);
    expect((await listConversations(ctx.hub, ada.id)).conversations).toHaveLength(0);
  });
});

describe('the timeline', () => {
  it('gives the newest page oldest first, then walks back', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    for (let i = 1; i <= 25; i += 1) await insertMessage(db, conversation.id, i % 2 === 0 ? ada.id : grace.id, `m${i}`);

    const page1 = await page(ada, conversation.id, { limit: 10 });
    expect(bodies(page1)).toEqual(['m16', 'm17', 'm18', 'm19', 'm20', 'm21', 'm22', 'm23', 'm24', 'm25']);
    const page2 = await page(ada, conversation.id, { limit: 10, before: page1.nextBefore });
    expect(bodies(page2)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15']);
    const page3 = await page(ada, conversation.id, { limit: 10, before: page2.nextBefore });
    expect(page3.items).toHaveLength(5);
    expect(page3.nextBefore).toBeNull();
  });

  it('pages by 50 and refuses a page size out of range', () => {
    expect(pageLimit(null)).toBe(50);
    for (const limit of ['0', '101', 'abc']) expect(() => pageLimit(limit)).toThrow();
  });

  it('refuses a malformed cursor, and a conversation you aren’t in', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    expect(await attempt(() => page(ada, conversation.id, { before: 'nonsense' }))).toMatchObject({ status: 400 });
    const theirs = await getOrCreateDirectConversation(db, grace.id, alan.id);
    expect(await attempt(() => page(ada, theirs.id))).toMatchObject({ status: 403, code: 'notInConversation' });
  });

  it('puts messages and finished calls in order, and leaves out calls still going on', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await db.query("insert into talk_messages (conversation_id, sender_id, body, created_at) values ($1, $2, 'before the call', now() - interval '3 minutes')", [
      conversation.id,
      ada.id,
    ]);
    const call = await insertCall(db, conversation.id, ada.id, grace.id);
    await markCallAnswered(db, call.id);
    await db.query(
      "update talk_calls set started_at = now() - interval '2 minutes', answered_at = now() - interval '2 minutes', ended_at = now() - interval '1 minute', outcome = 'answered' where id = $1",
      [call.id],
    );
    await db.query("insert into talk_messages (conversation_id, sender_id, body, created_at) values ($1, $2, 'after the call', now() - interval '30 seconds')", [
      conversation.id,
      grace.id,
    ]);
    await insertCall(db, conversation.id, ada.id, grace.id);

    const { items } = await page(ada, conversation.id);
    expect(items.map(item => item.kind)).toEqual(['message', 'call', 'message']);
    expect(items[1]).toMatchObject({ kind: 'call', outcome: 'answered', callerId: ada.id, calleeId: grace.id, durationSeconds: 60 });
  });

  it('doesn’t drop rows that share a millisecond', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    for (let i = 0; i < 25; i += 1) {
      await db.query(
        `insert into talk_messages (conversation_id, sender_id, body, created_at)
         values ($1, $2, $3, timestamptz '2026-01-01 00:00:00Z' + ($4 || ' microseconds')::interval)`,
        [conversation.id, ada.id, `m${i}`, String(i)],
      );
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let turn = 0; turn < 10; turn += 1) {
      const result: TimelineResponse = await page(ada, conversation.id, { limit: 10, before: cursor });
      seen.unshift(...bodies(result));
      cursor = result.nextBefore;
      if (!cursor) break;
    }
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => `m${i}`));
  });

  it('pages through both kinds without dropping or repeating anything', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    for (let i = 0; i < 12; i += 1) {
      const minutesAgo = String(60 - i);
      if (i % 2 === 0) {
        await db.query("insert into talk_messages (conversation_id, sender_id, body, created_at) values ($1, $2, $3, now() - ($4 || ' minutes')::interval)", [
          conversation.id,
          ada.id,
          `m${i}`,
          minutesAgo,
        ]);
      } else {
        const call = await insertCall(db, conversation.id, ada.id, grace.id);
        await db.query(
          "update talk_calls set started_at = now() - ($2 || ' minutes')::interval, ended_at = now() - ($2 || ' minutes')::interval, outcome = 'declined' where id = $1",
          [call.id, minutesAgo],
        );
      }
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let turn = 0; turn < 10; turn += 1) {
      const result: TimelineResponse = await page(ada, conversation.id, { limit: 5, before: cursor });
      seen.unshift(...result.items.map(item => `${item.kind}:${item.id}`));
      cursor = result.nextBefore;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(12);
    expect(seen.filter(s => s.startsWith('call'))).toHaveLength(6);
  });
});

describe('deleting messages', () => {
  let conversationId: number;
  beforeEach(async () => {
    conversationId = (await getOrCreateDirectConversation(db, ada.id, grace.id)).id;
  });
  const say = async (user: TestUser, body: string) => (await insertMessage(db, conversationId, user.id, body)).id;
  const summary = async (user: TestUser) => (await listConversations(ctx.hub, user.id)).conversations.find(c => c.id === conversationId);

  it('for everyone, empties it on both sides and leaves a marker in its place', async () => {
    const id = await say(ada, 'I regret this');
    await say(grace, 'noted');
    await deleteMessage(ctx.hub, ada.id, id, 'everyone');
    for (const user of [ada, grace]) {
      const message = (await page(user, conversationId)).items.find(item => item.kind === 'message' && item.id === id);
      expect(message).toMatchObject({ body: '', deletedAt: expect.any(String) });
    }
    expect(bodies(await page(grace, conversationId))).toEqual(['', 'noted']);
    // The text is really gone, not hidden behind a flag.
    expect((await db.query('select body from talk_messages where id = $1', [id])).rows[0]).toEqual({ body: '' });
  });

  it('for everyone, tells everyone in it at once', async () => {
    const graceSocket = await connect(grace);
    const id = await say(ada, 'oops');
    await deleteMessage(ctx.hub, ada.id, id, 'everyone');
    await graceSocket.waitWhere(m => m.type === 'message-deleted' && m.messageId === id);
  });

  it('for everyone, is only the sender’s, and only for people in it', async () => {
    const id = await say(grace, 'hers to withdraw');
    expect(await attempt(() => deleteMessage(ctx.hub, ada.id, id, 'everyone'))).toMatchObject({ status: 403, code: 'notYourMessage' });
    expect(await attempt(() => deleteMessage(ctx.hub, alan.id, id, 'everyone'))).toMatchObject({ status: 403, code: 'notInConversation' });
    expect(await attempt(() => deleteMessage(ctx.hub, alan.id, id, 'me'))).toMatchObject({ status: 403 });
    expect(await attempt(() => deleteMessage(ctx.hub, ada.id, 987_654, 'everyone'))).toMatchObject({ status: 404, code: 'messageNotFound' });
  });

  it('for everyone, twice, changes nothing the second time', async () => {
    const id = await say(ada, 'twice');
    await deleteMessage(ctx.hub, ada.id, id, 'everyone');
    const first = (await page(ada, conversationId)).items.find(item => item.id === id);
    await deleteMessage(ctx.hub, ada.id, id, 'everyone');
    expect((await page(ada, conversationId)).items.find(item => item.id === id)).toEqual(first);
  });

  it('for me, takes it out of my copy and leaves theirs, and is the default', async () => {
    const id = await say(grace, 'I will forget this');
    const own = await say(ada, 'mine');
    await say(grace, 'but not this');
    await deleteMessage(ctx.hub, ada.id, id, null);
    await deleteMessage(ctx.hub, ada.id, own, 'me');
    expect(bodies(await page(ada, conversationId))).toEqual(['but not this']);
    expect(bodies(await page(grace, conversationId))).toEqual(['I will forget this', 'mine', 'but not this']);
    expect(await attempt(() => deleteMessage(ctx.hub, ada.id, id, 'everybody'))).toMatchObject({ status: 400 });
  });

  it('keeps the list in step: withdrawn, hidden, cleared and unread', async () => {
    const older = await say(grace, 'older');
    const newest = await say(grace, 'newest');
    expect((await summary(ada))?.unreadCount).toBe(2);

    await deleteMessage(ctx.hub, ada.id, newest, 'me');
    expect((await summary(ada))?.lastMessage).toBe('older');
    expect((await summary(ada))?.unreadCount).toBe(1);
    expect((await summary(grace))?.lastMessage).toBe('newest');

    await deleteMessage(ctx.hub, grace.id, older, 'everyone');
    expect(await summary(ada)).toMatchObject({ lastMessage: null, lastMessageDeleted: true, unreadCount: 0 });

    await clearChat(ctx.hub, grace.id, conversationId);
    expect(await summary(grace)).toMatchObject({ lastMessage: null, lastMessageDeleted: false });
  });
});

describe('clearing a conversation', () => {
  it('empties my copy, calls too, and keeps what is said afterwards', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await insertMessage(db, conversation.id, ada.id, 'one');
    const call = await insertCall(db, conversation.id, ada.id, grace.id);
    await finishCall(db, call.id, 'declined');
    await clearChat(ctx.hub, ada.id, conversation.id);
    expect((await page(ada, conversation.id)).items).toEqual([]);
    expect((await page(grace, conversation.id)).items).toHaveLength(2);

    await insertMessage(db, conversation.id, grace.id, 'after');
    expect(bodies(await page(ada, conversation.id))).toEqual(['after']);
    expect(await attempt(() => clearChat(ctx.hub, alan.id, conversation.id))).toMatchObject({ status: 403 });
  });
});

describe('deleting a chat', () => {
  let conversationId: number;
  beforeEach(async () => {
    conversationId = (await getOrCreateDirectConversation(db, ada.id, grace.id)).id;
  });
  const listed = async (user: TestUser) => (await listConversations(ctx.hub, user.id)).conversations.map(c => c.id);
  const say = async (socket: TestSocket, text: string, attachmentId?: string) => {
    const clientId = `c-${Math.random()}`;
    socket.send({ type: 'chat', conversationId, text, clientId, ...(attachmentId ? { attachmentId } : {}) });
    await socket.waitWhere(m => m.type === 'message' && m.clientId === clientId);
  };

  it('takes it out of my list with my copy, leaves theirs, and tells my other devices', async () => {
    const socket = await connect(ada);
    await say(socket, 'hola');
    await deleteConversation(ctx.hub, ada.id, conversationId);
    await socket.waitWhere(m => m.type === 'conversation-removed' && m.conversationId === conversationId);
    expect(await listed(ada)).toEqual([]);
    expect(bodies(await page(ada, conversationId))).toEqual([]);
    expect(await listed(grace)).toEqual([conversationId]);
    expect(bodies(await page(grace, conversationId))).toEqual(['hola']);
  });

  it('comes back, empty, when something new is said, or when I start it again', async () => {
    const graceSocket = await connect(grace);
    await say(await connect(ada), 'old news');
    await deleteConversation(ctx.hub, ada.id, conversationId);
    await say(graceSocket, 'are you there?');
    expect(await listed(ada)).toEqual([conversationId]);
    expect(bodies(await page(ada, conversationId))).toEqual(['are you there?']);

    await deleteConversation(ctx.hub, ada.id, conversationId);
    await conversationWith(ctx.hub, ada.id, grace.id);
    expect(await listed(ada)).toEqual([conversationId]);
    expect(bodies(await page(ada, conversationId))).toEqual([]);
  });

  it('takes its files off my Files page, and off the disk once both have deleted it', async () => {
    const socket = await connect(ada);
    const { attachment } = await upload(ctx.hub, ada.id, conversationId, {
      body: Readable.toWeb(Readable.from([Buffer.from('%PDF-1.4 a small file')])) as ReadableStream<Uint8Array>,
      contentLength: null,
      contentType: 'application/octet-stream',
      fileName: 'a.pdf',
      fileType: 'application/pdf',
    });
    await say(socket, '', attachment.id);

    await deleteConversation(ctx.hub, ada.id, conversationId);
    expect((await sharedFiles(ctx.hub, ada.id, { filter: null, before: null, limit: 50 })).files).toEqual([]);
    expect(await ctx.hub.files.sweep()).toBe(0);
    await deleteConversation(ctx.hub, grace.id, conversationId);
    expect(await ctx.hub.files.sweep()).toBe(1);
  });

  it('is only for the people in it', async () => {
    expect(await attempt(() => deleteConversation(ctx.hub, alan.id, conversationId))).toMatchObject({ status: 403 });
  });
});

describe('the call log', () => {
  let conversationId: number;
  beforeEach(async () => {
    conversationId = (await getOrCreateDirectConversation(db, ada.id, grace.id)).id;
  });
  const history = (user: TestUser) => callHistory(ctx.hub, user.id, { filter: null, before: null, limit: 50 });
  const ring = async (outcome: 'answered' | 'no_answer') => {
    const call = await insertCall(db, conversationId, ada.id, grace.id, 'audio');
    if (outcome === 'answered') await markCallAnswered(db, call.id);
    await finishCall(db, call.id, outcome);
    return call.id;
  };

  it('loses a call from my log only, quietly a second time, and never for a stranger', async () => {
    const id = await ring('answered');
    await ring('answered');
    await deleteCall(ctx.hub, ada.id, id);
    await deleteCall(ctx.hub, ada.id, id);
    expect((await history(ada)).calls.map(call => call.id)).not.toContain(id);
    expect((await history(grace)).calls.map(call => call.id)).toContain(id);
    // Not found rather than forbidden, so call ids can't be mapped by trying them.
    expect(await attempt(() => deleteCall(ctx.hub, alan.id, id))).toMatchObject({ status: 404, code: 'callNotFound' });
  });

  it('doesn’t keep the badge lit for a missed call taken out of the log', async () => {
    const call = await insertCall(db, conversationId, ada.id, grace.id, 'audio');
    await finishCall(db, call.id, 'no_answer');
    expect((await history(grace)).unseenMissed).toBe(1);
    await deleteCall(ctx.hub, grace.id, call.id);
    expect((await history(grace)).unseenMissed).toBe(0);
  });

  it('clears the whole log for me alone, and keeps calls made afterwards', async () => {
    await ring('answered');
    await ring('answered');
    await clearCalls(ctx.hub, ada.id);
    expect((await history(ada)).calls).toEqual([]);
    expect((await history(grace)).calls).toHaveLength(2);
    const later = await ring('answered');
    expect((await history(ada)).calls.map(call => call.id)).toEqual([later]);
    // Again, after there is a row of its own to change.
    await clearCalls(ctx.hub, ada.id);
    expect((await history(ada)).calls).toEqual([]);
  });
});
