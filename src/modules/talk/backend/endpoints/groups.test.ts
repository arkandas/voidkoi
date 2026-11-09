import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ConversationSummary } from '@/modules/talk/lib/protocol';

import type { TestDatabase } from '../test/database';
import { attempt, createTestContext, seedUser, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { FakeDevice } from '../test/push-device';
import { TestSocket } from '../test/socket';
import { conversationWith, deleteConversation, listConversations, timeline } from './conversations';
import { serveAttachment, sharedFiles, upload } from './files';
import { addPeople, createGroup, deleteForEveryone, leave, photoOf, removePerson, removePhoto, renameGroupTo, setPhoto } from './groups';
import { subscribe } from './push';

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;
let linus: TestUser;
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
  linus = await seedUser(ctx, 'linus', { name: 'Linus' });
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

async function group(owner: TestUser, name: string, members: TestUser[]): Promise<ConversationSummary> {
  return (await createGroup(ctx.hub, owner.id, { name, memberIds: members.map(member => member.id) })).conversation;
}

async function say(socket: TestSocket, groupId: number, text: string, attachmentId?: string): Promise<void> {
  const clientId = `c-${Math.random()}`;
  socket.send({ type: 'chat', conversationId: groupId, text, clientId, ...(attachmentId ? { attachmentId } : {}) });
  await socket.waitWhere(m => m.type === 'message' && m.clientId === clientId);
}

const list = async (user: TestUser) => (await listConversations(ctx.hub, user.id)).conversations;

/** What someone reads in the group: words, and notices as "type:userId". */
async function read(user: TestUser, groupId: number): Promise<string[]> {
  const page = await timeline(ctx.hub, user.id, groupId, { before: null, limit: 50 });
  return page.items
    .filter(item => item.kind === 'message')
    .map(item => (item.kind === 'message' && item.event ? `${item.event.type}:${item.event.userId ?? item.event.text}` : item.kind === 'message' ? item.body : ''));
}

const stream = (bytes: Buffer) => Readable.toWeb(Readable.from([bytes])) as ReadableStream<Uint8Array>;
const uploadTo = (user: TestUser, groupId: number, bytes: Buffer, name: string) =>
  upload(ctx.hub, user.id, groupId, { body: stream(bytes), contentLength: null, contentType: 'application/octet-stream', fileName: name, fileType: null });

describe('making a group', () => {
  it('puts everyone in it, with whoever made it as owner', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    expect(familia).toMatchObject({ kind: 'group', other: null, group: { name: 'Familia', ownerId: ada.id, active: true } });
    expect(familia.group!.members.map(m => m.username)).toEqual(['ada', 'grace', 'alan']);
    for (const user of [ada, grace, alan]) expect((await list(user)).map(c => c.id)).toEqual([familia.id]);
    expect(await list(linus)).toEqual([]);
    expect(await read(grace, familia.id)).toEqual(['created:Familia']);
  });

  it('tells the people put in it', async () => {
    const graceSocket = await connect(grace);
    const familia = await group(ada, 'Familia', [grace]);
    await graceSocket.waitWhere(m => m.type === 'conversation-changed' && m.conversationId === familia.id);
  });

  it('needs a name, somebody else, and people who use Talk', async () => {
    const notes = await seedUser(ctx, 'notes', { apps: ['notes'] });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: ' ', memberIds: [grace.id] }))).toMatchObject({ status: 400, code: 'groupNameRequired' });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: 'x'.repeat(65), memberIds: [grace.id] }))).toMatchObject({ code: 'groupNameTooLong' });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: 'Solo', memberIds: [ada.id] }))).toMatchObject({ status: 400, code: 'groupNeedsPeople' });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: 'X', memberIds: [9999] }))).toMatchObject({ status: 404 });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: 'X', memberIds: [notes.id] }))).toMatchObject({ status: 404 });
    expect(await attempt(() => createGroup(ctx.hub, ada.id, { name: 'X', memberIds: 'everyone' }))).toMatchObject({ status: 400 });
  });
});

describe('talking in a group', () => {
  it('reaches everyone in it, and is unread for the others', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    const [adaSocket, graceSocket, alanSocket] = [await connect(ada), await connect(grace), await connect(alan)];
    await say(adaSocket, familia.id, 'hola a todos');
    for (const socket of [graceSocket, alanSocket]) await socket.waitWhere(m => m.type === 'message' && m.message.body === 'hola a todos');
    expect((await list(grace))[0]).toMatchObject({ unreadCount: 1, lastMessage: 'hola a todos', lastSenderId: ada.id });
    // The notice that it was made is news, not something waiting to be read.
    expect((await list(ada))[0]!.unreadCount).toBe(0);
  });

  it('notifies with the group as the title, the sender before the words, and a link to the group', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const device = new FakeDevice();
    await subscribe(ctx.hub, { id: grace.id, session_version: 0 }, device.subscription as unknown as Record<string, unknown>);
    await say(await connect(ada), familia.id, '¿cenamos?');
    const [request] = await ctx.push.waitFor(device.endpoint);
    expect(device.read(request!)).toMatchObject({ title: 'Familia', body: 'Ada: ¿cenamos?', url: `/talk?conversation=${familia.id}` });
  });
});

describe('what the owner can do', () => {
  it('renames it, and only the owner can', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    expect(await attempt(() => renameGroupTo(ctx.hub, grace.id, familia.id, { name: 'Mine' }))).toMatchObject({ status: 403, code: 'notGroupOwner' });
    expect((await renameGroupTo(ctx.hub, ada.id, familia.id, { name: 'Familia García' })).conversation.group!.name).toBe('Familia García');
    expect(await read(grace, familia.id)).toEqual(['created:Familia', 'renamed:Familia García']);
  });

  it('adds people, who read from when they were added', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    await say(await connect(ada), familia.id, 'before Alan');
    expect(await attempt(() => addPeople(ctx.hub, grace.id, familia.id, { userIds: [alan.id] }))).toMatchObject({ status: 403 });
    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [alan.id] });
    expect(await read(alan, familia.id)).toEqual([`added:${alan.id}`]);
    expect((await list(alan))[0]).toMatchObject({ unreadCount: 0, group: { active: true } });
  });

  it('removes someone, who keeps what they could read but hears nothing more', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    const [adaSocket, alanSocket] = [await connect(ada), await connect(alan)];
    await say(adaSocket, familia.id, 'still here, Alan?');
    await removePerson(ctx.hub, ada.id, familia.id, alan.id);
    await alanSocket.waitWhere(m => m.type === 'conversation-changed' && m.conversationId === familia.id);
    await say(adaSocket, familia.id, 'after Alan');
    expect(await read(alan, familia.id)).toEqual(['created:Familia', 'still here, Alan?', `removed:${alan.id}`]);
    expect((await list(alan))[0]!.group).toMatchObject({ active: false });

    alanSocket.send({ type: 'chat', conversationId: familia.id, text: 'hello?', clientId: 'a1' });
    await alanSocket.waitWhere(m => m.type === 'error' && m.code === 'unknown_conversation' && m.clientId === 'a1');
    expect(await attempt(() => removePerson(ctx.hub, ada.id, familia.id, ada.id))).toMatchObject({ code: 'useLeaveGroup' });
    expect(await attempt(() => removePerson(ctx.hub, ada.id, familia.id, alan.id))).toMatchObject({ status: 404, code: 'notInGroup' });
  });

  it('deletes it for everyone, files and all', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const [socket, graceSocket] = [await connect(ada), await connect(grace)];
    const { attachment } = await uploadTo(ada, familia.id, Buffer.from('%PDF-1.4 group file'), 'a.pdf');
    await say(socket, familia.id, '', attachment.id);
    const path = join(ctx.dataRoot, 'files', attachment.id.slice(0, 2), attachment.id);
    expect(existsSync(path)).toBe(true);

    expect(await attempt(() => deleteForEveryone(ctx.hub, grace.id, familia.id))).toMatchObject({ status: 403 });
    await deleteForEveryone(ctx.hub, ada.id, familia.id);
    await graceSocket.waitWhere(m => m.type === 'conversation-removed' && m.conversationId === familia.id);
    expect(await list(ada)).toEqual([]);
    expect(await list(grace)).toEqual([]);
    expect(existsSync(path)).toBe(false);
  });
});

describe('leaving', () => {
  it('keeps the group in my list, read-only, until I delete it from there', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    const adaSocket = await connect(ada);
    expect((await leave(ctx.hub, grace.id, familia.id))!.conversation.group).toMatchObject({ active: false });
    await say(adaSocket, familia.id, 'after Grace left');
    expect(await read(grace, familia.id)).toEqual(['created:Familia', 'left:null']);
    expect(await attempt(() => leave(ctx.hub, grace.id, familia.id))).toMatchObject({ status: 409, code: 'alreadyLeftGroup' });

    // Deleting it from the list is only once out of it.
    expect(await attempt(() => deleteConversation(ctx.hub, ada.id, familia.id))).toMatchObject({ status: 409, code: 'leaveGroupFirst' });
    await deleteConversation(ctx.hub, grace.id, familia.id);
    expect(await list(grace)).toEqual([]);
    // Whatever is said afterwards doesn't bring it back.
    await say(adaSocket, familia.id, 'anyone?');
    expect(await list(grace)).toEqual([]);
    expect((await list(alan)).map(c => c.id)).toEqual([familia.id]);
  });

  it('hands the group on when its owner leaves, to whoever has been in it longest', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    await leave(ctx.hub, ada.id, familia.id);
    expect((await list(grace))[0]!.group).toMatchObject({ ownerId: grace.id });
    expect(await read(grace, familia.id)).toEqual(['created:Familia', 'left:null', `owner:${grace.id}`]);
    await renameGroupTo(ctx.hub, grace.id, familia.id, { name: 'Ours now' });
  });

  it('deletes the group when the last one leaves', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    await leave(ctx.hub, grace.id, familia.id);
    expect(await leave(ctx.hub, ada.id, familia.id)).toBeNull();
    expect(await list(ada)).toEqual([]);
    expect(await list(grace)).toEqual([]);
  });

  it('leaves the group in my list as it was when I left: not renamed, joined or handed on since', async () => {
    const familia = await group(ada, 'Surprise', [grace, alan]);
    const adaSocket = await connect(ada);
    const { attachment } = await uploadTo(ada, familia.id, Buffer.from('%PDF-1.4 plan'), 'plan.pdf');
    await say(adaSocket, familia.id, '', attachment.id);
    await removePerson(ctx.hub, ada.id, familia.id, alan.id);

    await renameGroupTo(ctx.hub, ada.id, familia.id, { name: 'Party for Alan' });
    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [linus.id] });
    await leave(ctx.hub, ada.id, familia.id);

    const [seen] = await list(alan);
    expect(seen!.group).toMatchObject({ name: 'Surprise', ownerId: ada.id, active: false });
    expect(seen!.group!.members.map(m => [m.username, m.active])).toEqual([
      ['ada', true],
      ['grace', true],
      ['alan', false],
    ]);
    expect((await sharedFiles(ctx.hub, alan.id, { filter: null, before: null, limit: 50 })).files[0]!.group).toEqual({ name: 'Surprise' });

    // Everyone still in it sees it as it is.
    const [now] = await list(grace);
    expect(now!.group).toMatchObject({ name: 'Party for Alan', ownerId: grace.id, active: true });
    expect(now!.group!.members.map(m => [m.username, m.active])).toEqual([
      ['grace', true],
      ['linus', true],
      ['ada', false],
      ['alan', false],
    ]);
    expect((await sharedFiles(ctx.hub, grace.id, { filter: null, before: null, limit: 50 })).files[0]!.group).toEqual({ name: 'Party for Alan' });
  });

  it('shows people who came back after I left as I last saw them, and not those who came after', async () => {
    const familia = await group(ada, 'Familia', [grace, alan]);
    const adaSocket = await connect(ada);
    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [linus.id] });
    await leave(ctx.hub, linus.id, familia.id);
    await say(adaSocket, familia.id, 'before Alan left');
    await leave(ctx.hub, alan.id, familia.id);

    // Grace leaves and comes back, Linus comes back, someone new comes.
    const turing = await seedUser(ctx, 'turing', { name: 'Turing' });
    await leave(ctx.hub, grace.id, familia.id);
    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [grace.id, linus.id, turing.id] });

    const members = (await list(alan))[0]!.group!.members.map(m => [m.username, m.active]);
    expect(members).toEqual([
      ['ada', true],
      ['grace', true],
      ['alan', false],
      ['linus', false],
    ]);
    // Every message of my window still has its sender.
    expect(await read(alan, familia.id)).toEqual(['created:Familia', `added:${linus.id}`, 'left:null', 'before Alan left', 'left:null']);
  });

  it('keeps the photo I saw while it is still up, and never shows me one put up after I left', async () => {
    const png = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#0ea5e9' } }).png().toBuffer()).toString('base64');
    const familia = await group(ada, 'Familia', [grace, alan]);
    const first = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    await removePerson(ctx.hub, ada.id, familia.id, alan.id);
    expect((await list(alan))[0]!.group!.photoVersion).toBe(first);
    expect((await photoOf(ctx.hub, alan.id, familia.id)).id).toBe(first);

    const second = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    expect((await list(alan))[0]!.group!.photoVersion).toBeNull();
    expect(await attempt(() => photoOf(ctx.hub, alan.id, familia.id))).toMatchObject({ status: 404 });
    expect((await photoOf(ctx.hub, grace.id, familia.id)).id).toBe(second);

    // Nor one put up after I left a group that had none.
    const other = await group(ada, 'Otra', [grace]);
    await removePerson(ctx.hub, ada.id, other.id, grace.id);
    await setPhoto(ctx.hub, ada.id, other.id, { image: png });
    expect((await list(grace)).find(c => c.id === other.id)!.group!.photoVersion).toBeNull();
    expect(await attempt(() => photoOf(ctx.hub, grace.id, other.id))).toMatchObject({ status: 404 });
  });

  it('starts afresh when added back, without what was said meanwhile', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const adaSocket = await connect(ada);
    await leave(ctx.hub, grace.id, familia.id);
    await say(adaSocket, familia.id, 'while Grace was away');
    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [grace.id] });
    expect(await read(grace, familia.id)).toEqual([`added:${grace.id}`]);
    expect((await list(grace))[0]!.group).toMatchObject({ active: true });
  });
});

describe('files in a group', () => {
  it('are listed with the group and who sent them, and not to someone who joined later', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const socket = await connect(ada);
    const { attachment } = await uploadTo(ada, familia.id, Buffer.from('%PDF-1.4 menu'), 'menu.pdf');
    await say(socket, familia.id, '', attachment.id);

    const [file] = (await sharedFiles(ctx.hub, grace.id, { filter: null, before: null, limit: 50 })).files;
    expect(file).toMatchObject({ name: 'menu.pdf', direction: 'received', sender: { id: ada.id }, other: null, group: { name: 'Familia' } });

    await addPeople(ctx.hub, ada.id, familia.id, { userIds: [linus.id] });
    expect((await sharedFiles(ctx.hub, linus.id, { filter: null, before: null, limit: 50 })).files).toEqual([]);
    expect(await attempt(() => serveAttachment(ctx.hub, linus.id, attachment.id, 'files', { download: false, etag: null }))).toMatchObject({ status: 404 });
    expect((await attempt(() => serveAttachment(ctx.hub, grace.id, attachment.id, 'files', { download: false, etag: null }))).status).toBe(200);
  });

  it('can’t be uploaded by someone who left', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    await leave(ctx.hub, grace.id, familia.id);
    expect(await attempt(() => uploadTo(grace, familia.id, Buffer.from('x'), 'x.txt'))).toMatchObject({ status: 403 });
  });
});

it('leaves 1:1 conversations as they were', async () => {
  expect((await conversationWith(ctx.hub, ada.id, grace.id)).conversation).toMatchObject({ kind: 'direct', group: null, other: { id: grace.id } });
});

describe('the group photo', () => {
  let png: string;
  beforeAll(async () => {
    png = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#6d28d9' } }).png().toBuffer()).toString('base64');
  });
  const photoPath = (id: string) => join(ctx.dataRoot, 'group-photos', id.slice(0, 2), id);

  it('is set by the owner, made a small square, kept on disk, and shown to everyone in the group', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const version = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    expect(existsSync(photoPath(version))).toBe(true);

    const photo = await photoOf(ctx.hub, grace.id, familia.id);
    expect(photo).toMatchObject({ id: version, type: 'image/webp' });
    const stored = await sharp(photoPath(version)).metadata();
    expect(stored).toMatchObject({ format: 'webp', width: 256, height: 256 });

    expect(await attempt(() => photoOf(ctx.hub, linus.id, familia.id))).toMatchObject({ status: 404 });
    expect(await read(grace, familia.id)).toEqual(['created:Familia', 'photo:null']);
    // The database holds a name for the file, not the picture.
    expect((await db.query('select photo_id, photo_type from talk_conversations where id = $1', [familia.id])).rows[0]).toEqual({
      photo_id: version,
      photo_type: 'image/webp',
    });
  });

  it('is only the owner’s to change, and only a real picture', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    expect(await attempt(() => setPhoto(ctx.hub, grace.id, familia.id, { image: png }))).toMatchObject({ status: 403 });
    expect(await attempt(() => setPhoto(ctx.hub, ada.id, familia.id, { image: Buffer.from('<svg/>').toString('base64') }))).toMatchObject({
      status: 400,
      code: 'invalidImage',
    });
    expect(await attempt(() => setPhoto(ctx.hub, ada.id, familia.id, {}))).toMatchObject({ code: 'invalidImage' });
  });

  it('replaces the old file when changed, removes it when taken away, and goes with the group', async () => {
    const familia = await group(ada, 'Familia', [grace]);
    const first = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    const second = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    expect(second).not.toBe(first);
    expect(existsSync(photoPath(first))).toBe(false);

    expect((await removePhoto(ctx.hub, ada.id, familia.id)).conversation.group!.photoVersion).toBeNull();
    expect(existsSync(photoPath(second))).toBe(false);
    expect((await read(grace, familia.id)).at(-1)).toBe('photo:removed');

    const third = (await setPhoto(ctx.hub, ada.id, familia.id, { image: png })).conversation.group!.photoVersion!;
    await deleteForEveryone(ctx.hub, ada.id, familia.id);
    expect(existsSync(photoPath(third))).toBe(false);
  });
});
