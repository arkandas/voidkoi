import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SessionDescription } from '@/modules/talk/lib/protocol';

import { getOrCreateDirectConversation } from '../conversations';
import { callHistory } from '../endpoints/calls';
import { timeline } from '../endpoints/conversations';
import type { TestDatabase } from '../test/database';
import { createTestContext, seedUser, sessionCookie, settle, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { TestSocket } from '../test/socket';

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;
const sockets: TestSocket[] = [];

const OFFER: SessionDescription = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
const ANSWER: SessionDescription = { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n' };

async function connect(user: TestUser): Promise<TestSocket> {
  const socket = await TestSocket.connect(ctx.baseUrl!, user.cookie);
  sockets.push(socket);
  await socket.waitFor('welcome');
  return socket;
}

beforeAll(async () => {
  db = await testDatabase();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  // A one second ring keeps the timeout test quick.
  ctx = await createTestContext(db, { listen: true, ringTimeoutMs: 1000 });
  ada = await seedUser(ctx, 'ada', { name: 'Ada' });
  grace = await seedUser(ctx, 'grace', { name: 'Grace' });
  alan = await seedUser(ctx, 'alan', { name: null });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ctx.close();
});

describe('the upgrade', () => {
  it('refuses a socket with no session, with a 401 and no WebSocket', async () => {
    const refusal = await TestSocket.connectExpectingRefusal(ctx.baseUrl!);
    expect(refusal.statusCode).toBe(401);
    expect(refusal.body).toContain('unauthorized');
  });

  it('refuses a forged cookie', async () => {
    const refusal = await TestSocket.connectExpectingRefusal(ctx.baseUrl!, { cookie: `${ada.cookie.split('=')[0]}=nope` });
    expect(refusal.statusCode).toBe(401);
  });

  it('refuses a session from before the account’s sign-ins were ended', async () => {
    await db.query('update users set session_version = 1 where id = $1', [ada.id]);
    expect((await TestSocket.connectExpectingRefusal(ctx.baseUrl!, { cookie: ada.cookie })).statusCode).toBe(401);
    // A session from after it is fine.
    const socket = await TestSocket.connect(ctx.baseUrl!, await sessionCookie(ada.id, 1));
    sockets.push(socket);
    await socket.waitFor('welcome');
  });

  it('closes a socket when its session runs out', async () => {
    const socket = await TestSocket.connect(ctx.baseUrl!, await sessionCookie(ada.id, 0, 2));
    sockets.push(socket);
    await socket.waitFor('welcome');
    expect(await socket.waitForClose(4000)).toBe(4001);
  });

  it('refuses a session that has run out, even in the seconds reading it forgives', async () => {
    expect((await TestSocket.connectExpectingRefusal(ctx.baseUrl!, { cookie: await sessionCookie(ada.id, 0, -5) })).statusCode).toBe(401);
  });

  it('refuses someone who doesn’t use Talk, with a 403', async () => {
    const notes = await seedUser(ctx, 'notes', { apps: ['notes'] });
    expect((await TestSocket.connectExpectingRefusal(ctx.baseUrl!, { cookie: notes.cookie })).statusCode).toBe(403);
  });

  it('refuses a page from another site', async () => {
    const refusal = await TestSocket.connectExpectingRefusal(ctx.baseUrl!, { cookie: ada.cookie, origin: 'https://elsewhere.example' });
    expect(refusal.statusCode).toBe(403);
  });

  it('accepts a page from the address it is served at', async () => {
    const socket = await TestSocket.connect(ctx.baseUrl!, ada.cookie, { origin: ctx.baseUrl! });
    sockets.push(socket);
    await socket.waitFor('welcome');
  });

  it('sends welcome with the account and everyone who uses Talk, with no join needed', async () => {
    await seedUser(ctx, 'notes', { apps: ['notes'] });
    const socket = await connect(ada);
    const welcome = await socket.waitFor('welcome');

    expect(welcome.me).toEqual({ id: ada.id, username: 'ada', displayName: 'Ada', avatar: null, status: 'online' });
    expect(welcome.users).toHaveLength(3);
    expect(welcome.users.find(u => u.id === ada.id)?.status).toBe('online');
    expect(welcome.users.find(u => u.id === grace.id)?.status).toBe('offline');
    // No name: the username stands in.
    expect(welcome.users.find(u => u.id === alan.id)?.displayName).toBe('alan');
  });

  it('broadcasts presence when someone else connects and disconnects', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);

    await adaSocket.waitWhere(m => m.type === 'presence' && m.users.some(u => u.id === grace.id && u.status === 'online'), 5000, 'grace online');
    graceSocket.close();
    await adaSocket.waitWhere(m => m.type === 'presence' && m.users.some(u => u.id === grace.id && u.status === 'offline'), 5000, 'grace offline');
  });

  it('replaces an earlier socket of the same account', async () => {
    const first = await connect(ada);
    const second = await connect(ada);

    await first.waitFor('replaced');
    expect(await first.waitForClose()).toBe(4000);

    // The new one still works.
    second.send({ type: 'ping' });
    await second.waitFor('pong');
  });
});

describe('chat', () => {
  it('keeps a message and delivers it to both sides, with clientId for the sender', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);

    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: 'Are you there?', clientId: 'draft-1' });

    const toSender = await adaSocket.waitFor('message');
    const toPeer = await graceSocket.waitFor('message');
    expect(toSender.clientId).toBe('draft-1');
    expect(toSender.message).toMatchObject({ conversationId: conversation.id, senderId: ada.id, body: 'Are you there?' });
    // The other side never gets the sender's own id for it.
    expect(toPeer.clientId).toBeUndefined();
    expect(toPeer.message.id).toBe(toSender.message.id);

    const { rows } = await db.query('select body, sender_id from talk_messages where conversation_id = $1', [conversation.id]);
    expect(rows).toEqual([{ body: 'Are you there?', sender_id: ada.id }]);
  });

  it('still keeps it when the other side is offline', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: 'later', clientId: 'c1' });
    await adaSocket.waitFor('message');
    expect((await db.query('select 1 from talk_messages')).rows).toHaveLength(1);
  });

  it('refuses a conversation the sender isn’t in', async () => {
    const conversation = await getOrCreateDirectConversation(db, grace.id, alan.id);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: 'hi', clientId: 'c1' });
    const error = await adaSocket.waitFor('error');
    expect(error).toMatchObject({ code: 'unknown_conversation', clientId: 'c1' });
  });

  it('trims spaces and refuses an empty message', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: '   ', clientId: 'c1' });
    expect((await adaSocket.waitFor('error')).code).toBe('bad_message');
    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: '  hi  ', clientId: 'c2' });
    expect((await adaSocket.waitFor('message')).message.body).toBe('hi');
  });

  it('refuses a message past the length limit', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'chat', conversationId: conversation.id, text: 'x'.repeat(4001), clientId: 'c1' });
    expect((await adaSocket.waitFor('error')).code).toBe('too_long');
  });
});

describe('too many frames', () => {
  it('drops messages past sixty a minute, and gives the sender its bubble back', async () => {
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    for (let i = 1; i <= 61; i += 1) adaSocket.send({ type: 'chat', conversationId: conversation.id, text: `${i}`, clientId: `c${i}` });
    expect(await adaSocket.waitWhere(m => m.type === 'error' && m.code === 'rate_limited')).toMatchObject({ clientId: 'c61' });
    await adaSocket.waitWhere(() => adaSocket.all('message').length === 60, 10_000, 'sixty messages');
    expect((await db.query('select 1 from talk_messages')).rows).toHaveLength(60);
    // Everything else still goes.
    adaSocket.send({ type: 'ping' });
    await adaSocket.waitFor('pong');
  });

  it('drops calls past ten a minute, even from a new socket', async () => {
    let adaSocket = await connect(ada);
    for (let i = 0; i < 10; i += 1) adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    await adaSocket.waitWhere(() => adaSocket.all('call-ended').length === 10, 10_000, 'ten calls');

    adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    expect((await adaSocket.waitFor('error')).code).toBe('rate_limited');
    await settle();
    expect((await db.query('select 1 from talk_calls')).rows).toHaveLength(10);
    // Grace can still call Ada.
    const graceSocket = await connect(grace);
    graceSocket.send({ type: 'call-offer', to: ada.id, sdp: OFFER });
    await adaSocket.waitFor('incoming-call');
  });
});

describe('malformed frames', () => {
  it.each([
    ['not JSON', 'this is not json'],
    ['not an object', '"a string"'],
    ['an unknown type', '{"type":"drop-database"}'],
    ['missing fields', '{"type":"chat"}'],
    ['wrong field types', '{"type":"chat","conversationId":"1","text":5,"clientId":null}'],
    ['a bad sdp', '{"type":"call-offer","to":2,"sdp":{"type":"nonsense"}}'],
    ['a negative id', '{"type":"hangup","callId":-1}'],
    ['an array', '[1,2,3]'],
    ['null', 'null'],
    ['a visibility that isn’t true or false', '{"type":"visibility","visible":"yes"}'],
  ])('answers %s with an error and stays up', async (_label, raw) => {
    const socket = await connect(ada);
    socket.sendRaw(raw);
    expect((await socket.waitFor('error')).code).toBe('bad_message');
    socket.send({ type: 'ping' });
    await socket.waitFor('pong');
    expect(socket.closed).toBe(false);
  });
});

describe('a call that is answered', () => {
  it('runs offer, accept, candidates and hangup, and keeps the row', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);

    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const ringing = await adaSocket.waitFor('call-ringing');
    const incoming = await graceSocket.waitFor('incoming-call');

    expect(ringing.callId).toBe(incoming.callId);
    expect(ringing.to).toBe(grace.id);
    // The server says who is calling; the caller never gets to claim it.
    expect(incoming.from).toEqual({ id: ada.id, username: 'ada', displayName: 'Ada', avatar: null, status: 'in-call' });
    expect(incoming.sdp).toEqual(OFFER);
    const callId = incoming.callId;

    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    expect(await adaSocket.waitFor('call-accepted')).toMatchObject({ callId, from: grace.id, sdp: ANSWER });

    await adaSocket.waitWhere(m => m.type === 'presence' && m.users.filter(u => u.status === 'in-call').length === 2, 5000, 'both in a call');

    adaSocket.send({ type: 'ice-candidate', callId, candidate: { candidate: 'candidate:1 1 udp 1 10.0.0.1 4000 typ host', sdpMLineIndex: 0 } });
    const toCallee = await graceSocket.waitFor('ice-candidate');
    expect(toCallee).toMatchObject({ callId, from: ada.id });
    expect(toCallee.candidate.candidate).toContain('10.0.0.1');

    graceSocket.send({ type: 'ice-candidate', callId, candidate: { candidate: 'candidate:2 1 udp 1 10.0.0.2 4001 typ host', sdpMLineIndex: 0 } });
    expect(await adaSocket.waitFor('ice-candidate')).toMatchObject({ callId, from: grace.id });

    await settle(1100);
    adaSocket.send({ type: 'hangup', callId });

    const callerEnd = await adaSocket.waitFor('call-ended');
    const calleeEnd = await graceSocket.waitFor('call-ended');
    expect(callerEnd).toMatchObject({ callId, outcome: 'answered', from: ada.id });
    expect(calleeEnd).toMatchObject({ callId, outcome: 'answered' });
    expect(callerEnd.duration).toBeGreaterThanOrEqual(1);
    expect(callerEnd.duration).toEqual(calleeEnd.duration);

    const { rows } = await db.query<{ outcome: string; caller_id: number; callee_id: number; answered_at: Date | null; ended_at: Date | null }>(
      'select outcome, caller_id, callee_id, answered_at, ended_at from talk_calls where id = $1',
      [callId],
    );
    expect(rows[0]).toMatchObject({ outcome: 'answered', caller_id: ada.id, callee_id: grace.id });
    expect(rows[0]!.answered_at).not.toBeNull();
    expect(rows[0]!.ended_at).not.toBeNull();

    await adaSocket.waitWhere(m => m.type === 'presence' && m.users.every(u => u.status !== 'in-call'), 5000, 'nobody in a call');
  });

  it('makes the conversation the call belongs to', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const ringing = await adaSocket.waitFor('call-ringing');
    const incoming = await graceSocket.waitFor('incoming-call');
    expect(incoming.conversationId).toBe(ringing.conversationId);
    expect((await db.query('select 1 from talk_conversations')).rows).toHaveLength(1);
  });
});

describe('video calls', () => {
  it('tells the callee it is a video call, and keeps that on the row', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, media: 'video', sdp: OFFER });
    const ringing = await adaSocket.waitFor('call-ringing');
    const incoming = await graceSocket.waitFor('incoming-call');
    expect(incoming.media).toBe('video');
    expect(ringing.media).toBe('video');
    const { rows } = await db.query<{ media: string }>('select media from talk_calls where id = $1', [incoming.callId]);
    expect(rows[0]!.media).toBe('video');
  });

  it('is audio when the offer doesn’t say', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    expect((await graceSocket.waitFor('incoming-call')).media).toBe('audio');
  });

  it('refuses media it doesn’t know', async () => {
    const adaSocket = await connect(ada);
    await connect(grace);
    adaSocket.sendRaw(JSON.stringify({ type: 'call-offer', to: grace.id, media: 'hologram', sdp: OFFER }));
    expect((await adaSocket.waitFor('error')).code).toBe('bad_message');
  });

  it('carries the media to the call log and the timeline', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, media: 'video', sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');
    adaSocket.send({ type: 'hangup', callId });
    await adaSocket.waitFor('call-ended');

    const history = await callHistory(ctx.hub, ada.id, { filter: null, before: null, limit: 50 });
    expect(history.calls[0]!.media).toBe('video');

    const conversationId = (await adaSocket.waitFor('call-ringing')).conversationId;
    const page = await timeline(ctx.hub, ada.id, conversationId, { before: null, limit: 50 });
    expect(page.items[0]).toMatchObject({ kind: 'call', media: 'video' });
  });
});

describe('camera state', () => {
  it('passes it to the other side, stamped with who sent it', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, media: 'video', sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');

    adaSocket.send({ type: 'camera-state', callId, on: false });
    expect(await graceSocket.waitFor('camera-state')).toMatchObject({ callId, from: ada.id, on: false });
    graceSocket.send({ type: 'camera-state', callId, on: true });
    expect(await adaSocket.waitFor('camera-state')).toMatchObject({ callId, from: grace.id, on: true });
  });

  it('ignores it from a bystander, and after the call has ended', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    const alanSocket = await connect(alan);
    adaSocket.send({ type: 'call-offer', to: grace.id, media: 'video', sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;

    alanSocket.send({ type: 'camera-state', callId, on: false });
    await settle();
    expect(graceSocket.all('camera-state')).toHaveLength(0);
    expect(alanSocket.all('error')).toHaveLength(0);

    graceSocket.send({ type: 'call-decline', callId });
    await adaSocket.waitFor('call-ended');
    adaSocket.send({ type: 'camera-state', callId, on: false });
    await settle();
    expect(graceSocket.all('camera-state')).toHaveLength(0);
  });
});

describe('a call that is declined', () => {
  it('ends both sides and keeps declined', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-decline', callId });

    expect(await adaSocket.waitFor('call-ended')).toMatchObject({ callId, outcome: 'declined', duration: 0 });
    expect(await graceSocket.waitFor('call-ended')).toMatchObject({ outcome: 'declined' });
    const { rows } = await db.query('select outcome, answered_at from talk_calls where id = $1', [callId]);
    expect(rows[0]).toMatchObject({ outcome: 'declined', answered_at: null });
  });
});

describe('a call that is cancelled', () => {
  it('ends both sides, keeps cancelled, and counts as missed for the callee', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await adaSocket.waitFor('call-ringing')).callId;
    await graceSocket.waitFor('incoming-call');
    adaSocket.send({ type: 'call-cancel', callId });

    expect(await graceSocket.waitFor('call-ended')).toMatchObject({ callId, outcome: 'cancelled' });
    expect(await adaSocket.waitFor('call-ended')).toMatchObject({ outcome: 'cancelled' });
    expect((await callHistory(ctx.hub, grace.id, { filter: 'missed', before: null, limit: 50 })).unseenMissed).toBe(1);
  });

  it('refuses a cancel from the callee', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-cancel', callId });
    expect((await graceSocket.waitFor('error')).code).toBe('unknown_call');
  });
});

describe('a call nobody answers', () => {
  it('times out, tells both sides and keeps no_answer', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;

    const start = Date.now();
    expect(await adaSocket.waitFor('no-answer', 4000)).toMatchObject({ callId });
    expect(await graceSocket.waitFor('no-answer', 4000)).toMatchObject({ callId });
    expect(Date.now() - start).toBeGreaterThanOrEqual(500);
    expect(await adaSocket.waitFor('call-ended')).toMatchObject({ callId, outcome: 'no_answer', duration: 0 });
    const { rows } = await db.query<{ outcome: string }>('select outcome from talk_calls where id = $1', [callId]);
    expect(rows[0]!.outcome).toBe('no_answer');
  });

  it('stops the timer once the call is answered', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');
    await settle(1500);
    expect(adaSocket.all('no-answer')).toHaveLength(0);
    expect(adaSocket.all('call-ended')).toHaveLength(0);
  });
});

describe('callees out of reach', () => {
  it('answers unavailable when the callee is offline, and keeps a missed call', async () => {
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    expect((await adaSocket.waitFor('unavailable')).to).toBe(grace.id);
    expect(await adaSocket.waitFor('call-ended')).toMatchObject({ outcome: 'no_answer' });
    expect((await callHistory(ctx.hub, grace.id, { filter: 'missed', before: null, limit: 50 })).calls).toHaveLength(1);
  });

  it('answers busy when the callee is already in a call', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    const alanSocket = await connect(alan);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');

    alanSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    expect((await alanSocket.waitFor('busy')).to).toBe(grace.id);
    expect(await alanSocket.waitFor('call-ended')).toMatchObject({ outcome: 'busy' });
    // Grace never heard the second call.
    expect(graceSocket.all('incoming-call')).toHaveLength(1);
    const { rows } = await db.query<{ outcome: string }>('select outcome from talk_calls where caller_id = $1', [alan.id]);
    expect(rows[0]!.outcome).toBe('busy');
  });

  it('refuses a call to yourself', async () => {
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: ada.id, sdp: OFFER });
    expect((await adaSocket.waitFor('error')).code).toBe('not_allowed');
  });

  it('refuses a call to someone who doesn’t exist or doesn’t use Talk', async () => {
    const notes = await seedUser(ctx, 'notes', { apps: ['notes'] });
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: 99999, sdp: OFFER });
    expect((await adaSocket.waitFor('error')).code).toBe('unknown_user');
    adaSocket.send({ type: 'call-offer', to: notes.id, sdp: OFFER });
    await adaSocket.waitWhere(m => m.type === 'error' && m.code === 'unknown_user' && adaSocket.all('error').length === 2, 5000, 'second refusal');
  });

  it('refuses a second outgoing call while one is live', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    await connect(alan);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    await graceSocket.waitFor('incoming-call');
    adaSocket.send({ type: 'call-offer', to: alan.id, sdp: OFFER });
    expect((await adaSocket.waitFor('error')).code).toBe('invalid_state');
  });
});

describe('a socket that goes away mid-call', () => {
  it('ends the call for the other side', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');
    adaSocket.close();
    expect(await graceSocket.waitFor('call-ended')).toMatchObject({ callId, outcome: 'answered' });
  });

  it('cancels a call the caller left while it rang', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    adaSocket.close();
    expect(await graceSocket.waitFor('call-ended')).toMatchObject({ callId, outcome: 'cancelled' });
  });

  it('frees the callee to take another call', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    const alanSocket = await connect(alan);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');
    adaSocket.close();
    await graceSocket.waitFor('call-ended');

    alanSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    await graceSocket.waitWhere(m => m.type === 'incoming-call' && m.from.id === alan.id, 5000, 'call from alan');
  });
});

describe('acting on a call you aren’t in', () => {
  it('refuses an accept from a bystander', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    const alanSocket = await connect(alan);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    alanSocket.send({ type: 'call-accept', callId, sdp: ANSWER });
    expect((await alanSocket.waitFor('error')).code).toBe('unknown_call');
    expect(adaSocket.all('call-accepted')).toHaveLength(0);
  });

  it('drops ICE candidates for a call that has ended, quietly', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const callId = (await graceSocket.waitFor('incoming-call')).callId;
    graceSocket.send({ type: 'call-decline', callId });
    await adaSocket.waitFor('call-ended');
    adaSocket.send({ type: 'ice-candidate', callId, candidate: { candidate: 'late' } });
    await settle();
    expect(adaSocket.all('error')).toHaveLength(0);
    expect(graceSocket.all('ice-candidate')).toHaveLength(0);
  });

  it('refuses a hangup of an unknown call', async () => {
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'hangup', callId: 4242 });
    expect((await adaSocket.waitFor('error')).code).toBe('unknown_call');
  });
});
