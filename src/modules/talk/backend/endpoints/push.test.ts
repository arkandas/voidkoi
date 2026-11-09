import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SessionDescription } from '@/modules/talk/lib/protocol';

import { getOrCreateDirectConversation } from '../conversations';
import { createHub } from '../hub';
import { WATCHING_WINDOW_MS } from '../realtime/presence';
import type { TestDatabase } from '../test/database';
import { attempt, createTestContext, seedUser, settle, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { FakeDevice } from '../test/push-device';
import { TestSocket } from '../test/socket';
import { createGroup } from './groups';
import { devices, pushKey, subscribe, test, unsubscribe } from './push';

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;
const sockets: TestSocket[] = [];

const OFFER: SessionDescription = { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' };
const ANSWER: SessionDescription = { type: 'answer', sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n' };
const CANDIDATE = { candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };
const RING_MS = 2500;

beforeAll(async () => {
  db = await testDatabase();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  ctx = await createTestContext(db, { listen: true, ringTimeoutMs: RING_MS });
  ada = await seedUser(ctx, 'ada', { name: 'Ada Lovelace' });
  grace = await seedUser(ctx, 'grace', { name: 'Grace Hopper' });
  alan = await seedUser(ctx, 'alan', { name: 'Alan Turing' });
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

/** Notifications on for a pretend phone, the way the settings page does it. */
async function subscribed(user: TestUser, device = new FakeDevice(), sessionVersion = 0): Promise<FakeDevice> {
  await subscribe(ctx.hub, { id: user.id, session_version: sessionVersion }, device.subscription as unknown as Record<string, unknown>);
  return device;
}

const devicesOf = async (user: TestUser) => (await devices(ctx.hub, user.id)).endpoints;

async function say(from: TestSocket, conversationId: number, text: string): Promise<void> {
  from.send({ type: 'chat', conversationId, text, clientId: `c-${Math.random()}` });
  await from.waitWhere(m => m.type === 'message' && m.message.body === text.trim(), 5000, text);
}

describe('the server key', () => {
  it('is a P-256 point, and survives a restart, so every phone stays subscribed', async () => {
    const key = Buffer.from(pushKey(ctx.hub).publicKey, 'base64url');
    expect(key).toHaveLength(65);
    expect(key[0]).toBe(0x04);

    const dataRoot = await mkdtemp(join(tmpdir(), 'voidkoi-talk-restart-'));
    const restarted = await createHub({ db, config: ctx.hub.config, dataRoot, pushTransport: ctx.push.transport, log: () => {} });
    try {
      expect(pushKey(restarted)).toEqual(pushKey(ctx.hub));
    } finally {
      await restarted.close();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});

describe('subscribing a device', () => {
  it('keeps it for the account that asked', async () => {
    const device = await subscribed(grace);
    expect(await devicesOf(grace)).toEqual([device.endpoint]);
    expect(await devicesOf(ada)).toEqual([]);
  });

  it('only sends to the push services browsers use, never anywhere a page names', async () => {
    const good = new FakeDevice();
    for (const endpoint of ['https://169.254.169.254/latest/meta-data', 'https://evil.example.com/push', 'not a url']) {
      expect(await attempt(() => subscribe(ctx.hub, { id: grace.id, session_version: 0 }, { ...good.subscription, endpoint }))).toMatchObject({
        status: 400,
        code: 'pushServiceNotAllowed',
      });
    }
    for (const host of ['web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-par02p.notify.windows.com']) await subscribed(grace, new FakeDevice(host));
    expect(await devicesOf(grace)).toHaveLength(3);
  });

  it('refuses keys a browser would never send', async () => {
    const device = new FakeDevice();
    for (const keys of [{ p256dh: device.subscription.keys.p256dh }, { p256dh: 'short', auth: device.subscription.keys.auth }, { p256dh: device.subscription.keys.p256dh, auth: 'AAAA' }]) {
      expect(await attempt(() => subscribe(ctx.hub, { id: grace.id, session_version: 0 }, { endpoint: device.endpoint, keys }))).toMatchObject({
        status: 400,
        code: 'pushKeysInvalid',
      });
    }
  });

  it('moves a browser to whoever signs in on it next', async () => {
    const device = await subscribed(ada);
    await subscribed(grace, device);
    expect(await devicesOf(ada)).toEqual([]);
    expect(await devicesOf(grace)).toEqual([device.endpoint]);
  });

  it('turns off for one device without touching another, or anyone else’s', async () => {
    const phone = await subscribed(grace);
    const laptop = await subscribed(grace);
    const adas = await subscribed(ada);
    await unsubscribe(ctx.hub, ada.id, { endpoint: phone.endpoint });
    expect(await devicesOf(grace)).toHaveLength(2);
    await unsubscribe(ctx.hub, grace.id, { endpoint: phone.endpoint });
    expect(await devicesOf(grace)).toEqual([laptop.endpoint]);
    expect(await devicesOf(ada)).toEqual([adas.endpoint]);
  });

  it('stops when the account’s sign-ins are ended, as a new password does', async () => {
    await subscribed(grace);
    await db.query('update users set session_version = session_version + 1 where id = $1', [grace.id]);
    expect(await devicesOf(grace)).toEqual([]);
    expect((await db.query('select 1 from talk_push_subscriptions where user_id = $1', [grace.id])).rows).toHaveLength(0);
    // A device that subscribes from a sign-in after it counts.
    const device = await subscribed(grace, new FakeDevice(), 1);
    expect(await devicesOf(grace)).toEqual([device.endpoint]);
  });

  it('keeps the ten newest devices', async () => {
    const all: FakeDevice[] = [];
    for (let i = 0; i < 12; i += 1) {
      all.push(await subscribed(grace));
      await settle(5);
    }
    const kept = await devicesOf(grace);
    expect(kept).toHaveLength(10);
    expect(kept).not.toContain(all[0]!.endpoint);
    expect(kept).toContain(all[11]!.endpoint);
  });
});

describe('the test notification', () => {
  it('reaches the device, encrypted to it and signed by this server, in its language', async () => {
    await db.query("update users set locale = 'es' where id = $1", [grace.id]);
    const device = await subscribed(grace);
    await test(ctx.hub, grace.id, { endpoint: device.endpoint });
    const [request] = await ctx.push.waitFor(device.endpoint);
    expect(request!.headers['Content-Encoding']).toBe('aes128gcm');
    expect(request!.headers['Urgency']).toBe('high');
    expect(request!.headers['Authorization']).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${pushKey(ctx.hub).publicKey}$`));
    expect(request!.body.toString('latin1')).not.toContain('notificaciones');
    expect(device.read(request!)).toMatchObject({ kind: 'test', title: 'Talk', body: 'Las notificaciones funcionan en este dispositivo.', url: '/settings/talk' });
  });

  it('only goes to one of your own devices', async () => {
    const device = await subscribed(grace);
    expect(await attempt(() => test(ctx.hub, ada.id, { endpoint: device.endpoint }))).toMatchObject({ status: 404, code: 'pushNotOn' });
    await settle(100);
    expect(ctx.push.requests).toHaveLength(0);
  });

  it('forgets a device its push service has forgotten', async () => {
    const device = await subscribed(grace);
    ctx.push.status = 410;
    expect(await attempt(() => test(ctx.hub, grace.id, { endpoint: device.endpoint }))).toMatchObject({ status: 502, code: 'pushDeviceGone' });
    expect(await devicesOf(grace)).toEqual([]);
  });
});

describe('a message notification', () => {
  it('reaches someone without Talk open, with who, what and where to go', async () => {
    const phone = await subscribed(grace);
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await say(await connect(ada), conversation.id, 'Found a moth in relay 70 🦋');
    const [request] = await ctx.push.waitFor(phone.endpoint);
    expect(phone.read(request!)).toMatchObject({
      kind: 'message',
      title: 'Ada Lovelace',
      body: 'Found a moth in relay 70 🦋',
      tag: `conversation-${conversation.id}`,
      url: `/talk?with=${ada.id}`,
      badge: 1,
    });
    expect(request!.headers['Topic']).toBe(`conversation-${conversation.id}`);
    expect(request!.headers['Urgency']).toBe('normal');
  });

  it('counts every unread message for the badge on the Home Screen icon', async () => {
    const phone = await subscribed(grace);
    const withAda = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const withAlan = await getOrCreateDirectConversation(db, alan.id, grace.id);
    await say(await connect(ada), withAda.id, 'one');
    await ctx.push.waitFor(phone.endpoint, 1);
    await say(await connect(alan), withAlan.id, 'two');
    expect(phone.read((await ctx.push.waitFor(phone.endpoint, 2))[1]!).badge).toBe(2);
  });

  it('isn’t sent to someone looking at Talk, and is once it goes to the background or quiet', async () => {
    const phone = await subscribed(grace);
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);

    await say(adaSocket, conversation.id, 'You can see this already');
    await graceSocket.waitFor('message');
    await settle(300);
    expect(ctx.push.to(phone.endpoint)).toHaveLength(0);

    graceSocket.send({ type: 'visibility', visible: false });
    await settle(100);
    await say(adaSocket, conversation.id, 'Are you there?');
    expect(phone.read((await ctx.push.waitFor(phone.endpoint))[0]!).body).toBe('Are you there?');

    graceSocket.send({ type: 'visibility', visible: true });
    await settle(100);
    // A phone can freeze the page without a word, leaving its socket open.
    ctx.hub.presence.get(grace.id)!.lastSeenAt -= WATCHING_WINDOW_MS + 1000;
    await say(adaSocket, conversation.id, 'Still there?');
    expect(phone.read((await ctx.push.waitFor(phone.endpoint, 2))[1]!).body).toBe('Still there?');
  });

  it('is never sent to whoever wrote it', async () => {
    const adasPhone = await subscribed(ada);
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'visibility', visible: false });
    await settle(100);
    await say(adaSocket, conversation.id, 'Sent from my laptop');
    await settle(300);
    expect(ctx.push.to(adasPhone.endpoint)).toHaveLength(0);
  });

  it('never holds up the conversation when a push service is down', async () => {
    await subscribed(grace);
    ctx.push.status = 500;
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    await say(await connect(ada), conversation.id, 'Delivered regardless');
    expect((await db.query('select 1 from talk_messages where body = $1', ['Delivered regardless'])).rows).toHaveLength(1);
  });
});

describe('an account that no longer uses Talk', () => {
  const setApps = (user: TestUser, apps: string[]) => db.query('update users set apps = $2 where id = $1', [user.id, apps]);

  it('gets no notifications, in a chat or a group, until it takes Talk back', async () => {
    const phone = await subscribed(grace);
    const conversation = await getOrCreateDirectConversation(db, ada.id, grace.id);
    const familia = (await createGroup(ctx.hub, ada.id, { name: 'Familia', memberIds: [grace.id] })).conversation;
    const adaSocket = await connect(ada);
    await setApps(grace, ['notes']);

    await say(adaSocket, conversation.id, 'Plans for Friday');
    await say(adaSocket, familia.id, 'Plans for Saturday');
    await settle(300);
    expect(ctx.push.to(phone.endpoint)).toHaveLength(0);
    expect(await devicesOf(grace)).toEqual([]);
    expect(await ctx.hub.push.hasDevices(grace.id)).toBe(false);
    expect(await attempt(() => test(ctx.hub, grace.id, { endpoint: phone.endpoint }))).toMatchObject({ status: 404, code: 'pushNotOn' });

    // Its devices weren't forgotten: taking Talk back brings them back.
    await setApps(grace, ['notes', 'talk']);
    expect(await devicesOf(grace)).toEqual([phone.endpoint]);
    await say(adaSocket, conversation.id, 'Welcome back');
    expect(phone.read((await ctx.push.waitFor(phone.endpoint))[0]!).body).toBe('Welcome back');
  });

  it('isn’t woken for a call it was ringing with', async () => {
    await subscribed(grace);
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const { callId } = await graceSocket.waitFor('incoming-call');
    await setApps(grace, ['notes']);
    graceSocket.close();
    // Nothing can bring her back to it, so it ends now rather than ringing on.
    expect(await adaSocket.waitFor('call-ended', 1500)).toMatchObject({ callId, outcome: 'no_answer' });
  });
});

describe('calling someone without Talk open', () => {
  it('rings their phone, and hands them the call when they open Talk', async () => {
    const phone = await subscribed(grace);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER, media: 'video' });
    const ringing = await adaSocket.waitFor('call-ringing');
    expect(adaSocket.all('unavailable')).toHaveLength(0);

    const [push] = await ctx.push.waitFor(phone.endpoint);
    expect(phone.read(push!)).toMatchObject({ kind: 'call', title: 'Ada Lovelace', body: 'Incoming video call', tag: `call-${ringing.callId}`, url: '/talk' });
    expect(push!.headers['Urgency']).toBe('high');
    expect(push!.headers['TTL']).toBe(String(Math.ceil(RING_MS / 1000)));

    adaSocket.send({ type: 'ice-candidate', callId: ringing.callId, candidate: CANDIDATE });
    await settle(100);

    const graceSocket = await connect(grace);
    const incoming = await graceSocket.waitFor('incoming-call');
    expect(incoming).toMatchObject({ callId: ringing.callId, media: 'video', sdp: OFFER });
    expect(await graceSocket.waitFor('ice-candidate')).toMatchObject({ callId: ringing.callId, from: ada.id, candidate: CANDIDATE });
    // The call comes after the welcome, never before it.
    expect(graceSocket.received.findIndex(m => m.type === 'welcome')).toBeLessThan(graceSocket.received.findIndex(m => m.type === 'incoming-call'));

    graceSocket.send({ type: 'call-accept', callId: ringing.callId, sdp: ANSWER });
    expect(await adaSocket.waitFor('call-accepted')).toMatchObject({ callId: ringing.callId, sdp: ANSWER });
  });

  it('becomes a missed call on their phone when they don’t pick up, or the caller gives up', async () => {
    const phone = await subscribed(grace);
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const { callId } = await adaSocket.waitFor('call-ringing');
    expect(await adaSocket.waitFor('call-ended', RING_MS + 3000)).toMatchObject({ callId, outcome: 'no_answer' });
    const [ring, missed] = await ctx.push.waitFor(phone.endpoint, 2);
    expect(phone.read(missed!)).toMatchObject({ kind: 'missed-call', body: 'Missed call', url: '/talk/calls' });
    // The same tag, so "Missed call" takes the place of "Incoming call".
    expect(phone.read(missed!).tag).toBe(phone.read(ring!).tag);

    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const second = await adaSocket.waitWhere(m => m.type === 'call-ringing' && m.callId !== callId);
    await ctx.push.waitFor(phone.endpoint, 3);
    adaSocket.send({ type: 'call-cancel', callId: (second as { callId: number }).callId });
    expect(phone.read((await ctx.push.waitFor(phone.endpoint, 4))[3]!).kind).toBe('missed-call');
  });

  it('still answers unavailable for someone with notifications off', async () => {
    const adaSocket = await connect(ada);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    expect((await adaSocket.waitFor('unavailable')).to).toBe(grace.id);
  });
});

describe('calling someone with Talk open', () => {
  it('rings on their phone too while Talk is in the background, and only in Talk while they look at it', async () => {
    const phone = await subscribed(grace);
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);

    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const first = await graceSocket.waitFor('incoming-call');
    graceSocket.send({ type: 'call-decline', callId: first.callId });
    await adaSocket.waitFor('call-ended');
    await settle(300);
    // Neither ringing nor missed: she saw it, and said no.
    expect(ctx.push.to(phone.endpoint)).toHaveLength(0);

    graceSocket.send({ type: 'visibility', visible: false });
    await settle(100);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    await graceSocket.waitWhere(m => m.type === 'incoming-call' && m.callId !== first.callId);
    expect(phone.read((await ctx.push.waitFor(phone.endpoint))[0]!).kind).toBe('call');
  });

  it('keeps ringing when a phone drops its socket, and hands the call over when it is back', async () => {
    await subscribed(grace);
    const adaSocket = await connect(ada);
    const first = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const { callId } = await first.waitFor('incoming-call');
    first.close();
    await settle(300);
    expect(adaSocket.all('call-ended')).toHaveLength(0);

    const second = await connect(grace);
    expect((await second.waitFor('incoming-call')).callId).toBe(callId);
    second.send({ type: 'call-accept', callId, sdp: ANSWER });
    await adaSocket.waitFor('call-accepted');
  });

  it('ends at once when the callee drops out with no way to reach them', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    adaSocket.send({ type: 'call-offer', to: grace.id, sdp: OFFER });
    const { callId } = await graceSocket.waitFor('incoming-call');
    graceSocket.close();
    expect(await adaSocket.waitFor('call-ended', 1500)).toMatchObject({ callId, outcome: 'no_answer' });
  });
});
