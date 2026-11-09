import { existsSync } from 'node:fs';
import { mkdir, readdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Attachment, ChatMessage } from '@/modules/talk/lib/protocol';

import { cleanFileName } from '../files/sniff';
import type { TestDatabase } from '../test/database';
import { attempt, createTestContext, seedUser, testDatabase, type TestContext, type TestUser } from '../test/harness';
import { FakeDevice } from '../test/push-device';
import { TestSocket } from '../test/socket';
import { conversationWith, deleteMessage, clearChat, listConversations, timeline } from './conversations';
import { cancelUpload, serveAttachment, sharedFiles, upload, uploadPreview } from './files';
import { talkConfig } from './people';
import { subscribe } from './push';

/** The smallest PNG: one transparent pixel. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

let db: TestDatabase;
let ctx: TestContext;
let ada: TestUser;
let grace: TestUser;
let alan: TestUser;
let conversationId: number;
const sockets: TestSocket[] = [];

beforeAll(async () => {
  db = await testDatabase();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  ctx = await createTestContext(db, { listen: true, maxUploadBytes: 1024 * 1024 });
  ada = await seedUser(ctx, 'ada', { name: 'Ada Lovelace' });
  grace = await seedUser(ctx, 'grace', { name: 'Grace Hopper', locale: 'es' });
  alan = await seedUser(ctx, 'alan', { name: 'Alan Turing' });
  conversationId = (await conversationWith(ctx.hub, ada.id, grace.id)).conversation.id;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ctx.close();
});

const stream = (bytes: Buffer) => Readable.toWeb(Readable.from([bytes])) as ReadableStream<Uint8Array>;

function put(user: TestUser, bytes: Buffer, name: string, options: { type?: string; conversation?: number; length?: number } = {}) {
  return upload(ctx.hub, user.id, options.conversation ?? conversationId, {
    body: stream(bytes),
    contentLength: options.length ?? null,
    contentType: 'application/octet-stream',
    fileName: encodeURIComponent(name),
    fileType: options.type ?? null,
  });
}

const uploaded = async (user: TestUser, bytes: Buffer, name: string, type?: string): Promise<Attachment> => (await put(user, bytes, name, { type })).attachment;

function preview(user: TestUser, id: string, bytes: Buffer, size = { width: 4000, height: 3000 }) {
  return uploadPreview(ctx.hub, user.id, id, {
    body: stream(bytes),
    contentLength: null,
    contentType: 'application/octet-stream',
    fileName: null,
    fileType: null,
    width: String(size.width),
    height: String(size.height),
  });
}

async function connect(user: TestUser): Promise<TestSocket> {
  const socket = await TestSocket.connect(ctx.baseUrl!, user.cookie);
  sockets.push(socket);
  await socket.waitFor('welcome');
  return socket;
}

/** Send an upload as a message, and wait for the server to echo it. */
async function send(socket: TestSocket, attachmentId: string, text = '', conversation = conversationId): Promise<ChatMessage> {
  const clientId = `c-${Math.random()}`;
  socket.send({ type: 'chat', conversationId: conversation, text, clientId, attachmentId });
  const echo = await socket.waitWhere(m => m.type === 'message' && m.clientId === clientId);
  return (echo as { message: ChatMessage }).message;
}

const onDisk = (kind: 'files' | 'previews', id: string) => existsSync(join(ctx.dataRoot, kind, id.slice(0, 2), id));
const download = (user: TestUser, id: string, options = { download: false }) =>
  attempt(() => serveAttachment(ctx.hub, user.id, id, 'files', { download: options.download, etag: null }));
const files = async (user: TestUser, filter: string | null = null, before: string | null = null, limit = 50) =>
  sharedFiles(ctx.hub, user.id, { filter, before, limit });

describe('uploading', () => {
  it('keeps the file on disk and only what is known about it in the database', async () => {
    const attachment = await uploaded(ada, PDF, 'Informe anual.pdf', 'application/pdf');
    expect(attachment).toMatchObject({ name: 'Informe anual.pdf', contentType: 'application/pdf', sizeBytes: PDF.length, isImage: false, hasPreview: false });
    expect(onDisk('files', attachment.id)).toBe(true);
    const { rows } = await db.query<Record<string, unknown>>('select * from talk_attachments where id = $1', [attachment.id]);
    expect(Object.values(rows[0]!).some(value => value instanceof Uint8Array)).toBe(false);
  });

  it('decides what is a picture from the bytes, not the name or the claim', async () => {
    expect(await uploaded(ada, PNG, 'photo.dat', 'application/octet-stream')).toMatchObject({ isImage: true, contentType: 'image/png' });
    expect(await uploaded(ada, Buffer.from('<svg onload="alert(1)"/>'), 'x.png', 'image/png')).toMatchObject({ isImage: false, contentType: 'image/png' });
  });

  it('only lets people in the conversation upload to it', async () => {
    expect(await attempt(() => put(alan, PDF, 'a.pdf'))).toMatchObject({ status: 403, code: 'notInConversation' });
  });

  it('refuses a file over the limit, and leaves nothing behind', async () => {
    expect(await attempt(() => put(ada, Buffer.alloc(1024 * 1024 + 1), 'big.bin'))).toMatchObject({ status: 413, code: 'fileTooLarge' });
    // Said up front, it is refused before a byte is read.
    expect(await attempt(() => put(ada, PDF, 'big.pdf', { length: 1024 * 1024 + 1 }))).toMatchObject({ status: 413 });
    expect(await readdir(join(ctx.dataRoot, 'files'))).toEqual([]);
    expect(await readdir(join(ctx.dataRoot, 'incoming'))).toEqual([]);
  });

  it('refuses an empty file', async () => {
    expect(await attempt(() => put(ada, Buffer.alloc(0), 'empty.txt'))).toMatchObject({ status: 400, code: 'emptyAttachment' });
  });

  it('can be taken back before it is sent, by its uploader only', async () => {
    const attachment = await uploaded(ada, PDF, 'oops.pdf');
    expect(await attempt(() => cancelUpload(ctx.hub, grace.id, attachment.id))).toMatchObject({ status: 404 });
    await cancelUpload(ctx.hub, ada.id, attachment.id);
    expect(onDisk('files', attachment.id)).toBe(false);
  });

  it('tells the browser the limit before it uploads', () => {
    expect(talkConfig(ctx.hub, 'chat.example.com')).toMatchObject({ maxUploadBytes: 1024 * 1024 });
  });
});

describe('the room each account has', () => {
  beforeEach(() => {
    ctx.hub.config.uploadQuotaBytes = 2500;
  });

  const bytes = (size: number) => Buffer.alloc(size, 1);
  const filesOnDisk = async () => (await Promise.all((await readdir(join(ctx.dataRoot, 'files'))).map(shard => readdir(join(ctx.dataRoot, 'files', shard))))).flat();

  it('refuses a file that won’t fit, before a byte is read when it says how big it is', async () => {
    await uploaded(ada, bytes(2000), 'a.bin');
    let read = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          read = true;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const declared = upload(ctx.hub, ada.id, conversationId, { body, contentLength: 600, contentType: 'application/octet-stream', fileName: 'b.bin', fileType: null });
    expect(await attempt(() => declared)).toMatchObject({ status: 413, code: 'quotaExceeded' });
    expect(read).toBe(false);

    // Without saying, it stops at the edge and leaves nothing behind.
    expect(await attempt(() => put(ada, bytes(600), 'b.bin'))).toMatchObject({ status: 413, code: 'quotaExceeded' });
    expect(await readdir(join(ctx.dataRoot, 'incoming'))).toEqual([]);
    expect(await filesOnDisk()).toHaveLength(1);

    // What fits still goes, to the last byte, and then nothing does.
    expect((await uploaded(ada, bytes(500), 'c.bin')).sizeBytes).toBe(500);
    expect(await attempt(() => put(ada, bytes(1), 'd.bin'))).toMatchObject({ status: 413, code: 'quotaExceeded' });
    // A file too big for anyone is still that.
    expect(await attempt(() => put(ada, bytes(1), 'e.bin', { length: 1024 * 1024 + 1 }))).toMatchObject({ code: 'fileTooLarge' });
    // Everyone has their own.
    expect((await uploaded(grace, bytes(2500), 'f.bin')).sizeBytes).toBe(2500);
  });

  it('counts only the files still kept', async () => {
    const sent = await uploaded(ada, bytes(1500), 'sent.bin');
    const unsent = await uploaded(ada, bytes(1000), 'unsent.bin');
    expect(await attempt(() => put(ada, bytes(1000), 'more.bin'))).toMatchObject({ code: 'quotaExceeded' });

    const message = await send(await connect(ada), sent.id);
    await deleteMessage(ctx.hub, ada.id, message.id, 'everyone');
    await cancelUpload(ctx.hub, ada.id, unsent.id);
    expect((await uploaded(ada, bytes(2500), 'all of it.bin')).sizeBytes).toBe(2500);
  });

  it('holds when two uploads that each fit end together', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const later = () =>
      new ReadableStream<Uint8Array>({
        async start(controller) {
          await gate;
          controller.enqueue(bytes(1500));
          controller.close();
        },
      });
    const both = Promise.all(
      ['one.bin', 'two.bin'].map(name =>
        attempt(() => upload(ctx.hub, ada.id, conversationId, { body: later(), contentLength: null, contentType: 'application/octet-stream', fileName: name, fileType: null })),
      ),
    );
    // Both are past the first look, waiting for their bytes.
    await new Promise(resolve => setTimeout(resolve, 100));
    release();
    expect((await both).map(result => result.code).sort()).toEqual([null, 'quotaExceeded']);
    expect((await db.query('select 1 from talk_attachments')).rows).toHaveLength(1);
    expect(await filesOnDisk()).toHaveLength(1);
  });
});

describe('previews', () => {
  it('keep the small picture next to the file, with the original’s size', async () => {
    const attachment = await uploaded(ada, PNG, 'photo.png');
    expect((await preview(ada, attachment.id, PNG)).attachment).toMatchObject({ hasPreview: true, width: 4000, height: 3000 });
    expect(onDisk('previews', attachment.id)).toBe(true);
  });

  it('are only a picture, only from the uploader, only before sending', async () => {
    const attachment = await uploaded(ada, PNG, 'photo.png');
    expect(await attempt(() => preview(ada, attachment.id, PDF))).toMatchObject({ status: 400, code: 'previewNotPicture' });
    expect(onDisk('previews', attachment.id)).toBe(false);
    expect(await attempt(() => preview(grace, attachment.id, PNG))).toMatchObject({ status: 404 });
    await send(await connect(ada), attachment.id);
    expect(await attempt(() => preview(ada, attachment.id, PNG))).toMatchObject({ status: 404 });
  });
});

describe('sending', () => {
  it('arrives as a message with its file, on both sides', async () => {
    const [adaSocket, graceSocket] = [await connect(ada), await connect(grace)];
    const attachment = await uploaded(ada, PNG, 'photo.png');
    const sent = await send(adaSocket, attachment.id, 'Mira esto');
    const received = (await graceSocket.waitWhere(m => m.type === 'message' && m.message.id === sent.id)) as { message: ChatMessage };
    expect(sent).toMatchObject({ body: 'Mira esto', attachment: { id: attachment.id, name: 'photo.png' } });
    expect(received.message.attachment).toEqual(sent.attachment);
  });

  it('can’t send someone else’s upload, one meant for another chat, or the same one twice', async () => {
    const adaSocket = await connect(ada);
    const graceSocket = await connect(grace);
    const attachment = await uploaded(ada, PDF, 'a.pdf');
    const refused = async (socket: TestSocket, conversation: number) => {
      const clientId = `x-${Math.random()}`;
      socket.send({ type: 'chat', conversationId: conversation, text: '', clientId, attachmentId: attachment.id });
      await socket.waitWhere(m => m.type === 'error' && m.code === 'bad_attachment' && m.clientId === clientId);
    };
    await refused(graceSocket, conversationId);
    await refused(adaSocket, (await conversationWith(ctx.hub, ada.id, alan.id)).conversation.id);
    await send(adaSocket, attachment.id);
    await refused(adaSocket, conversationId);
    // No refusal left a message behind.
    expect((await db.query('select 1 from talk_messages')).rows).toHaveLength(1);
  });

  it('shows in the timeline and in the conversation list', async () => {
    await send(await connect(ada), (await uploaded(ada, PNG, 'photo.png')).id);
    const page = await timeline(ctx.hub, grace.id, conversationId, { before: null, limit: 50 });
    expect(page.items[0]).toMatchObject({ kind: 'message', attachment: { name: 'photo.png', isImage: true } });
    const list = await listConversations(ctx.hub, grace.id);
    expect(list.conversations[0]).toMatchObject({ lastAttachment: { name: 'photo.png', isImage: true } });
  });

  it('notifies with "Photo" in the recipient’s language when there are no words', async () => {
    const device = new FakeDevice();
    await subscribe(ctx.hub, { id: grace.id, session_version: 0 }, device.subscription as unknown as Record<string, unknown>);
    await send(await connect(ada), (await uploaded(ada, PNG, 'photo.png')).id);
    const [request] = await ctx.push.waitFor(device.endpoint);
    expect(device.read(request!)).toMatchObject({ title: 'Ada Lovelace', body: '📷 Foto' });
  });
});

describe('downloading', () => {
  async function sentFile(bytes: Buffer, name: string, type?: string): Promise<Attachment> {
    const attachment = await uploaded(ada, bytes, name, type);
    await send(await connect(ada), attachment.id);
    return attachment;
  }

  it('shows a picture in the page, as the type its bytes say', async () => {
    const attachment = await sentFile(PNG, 'photo.png');
    const response = (await download(grace, attachment.id)).body!;
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    const forced = (await download(grace, attachment.id, { download: true })).body!;
    expect(forced.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('offers anything else only as a download of plain bytes', async () => {
    const page = await sentFile(Buffer.from('<script>alert(document.cookie)</script>'), 'página.html', 'text/html');
    const response = (await download(grace, page.id)).body!;
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="p_gina.html"; filename*=UTF-8''p%C3%A1gina.html`);
  });

  it('is only for the people in the conversation, and only the uploader’s until it is sent', async () => {
    const unsent = await uploaded(ada, PDF, 'draft.pdf');
    expect((await download(grace, unsent.id)).status).toBe(404);
    expect((await download(ada, unsent.id)).status).toBe(200);
    const attachment = await sentFile(PDF, 'a.pdf');
    expect((await download(alan, attachment.id)).status).toBe(404);
    expect((await download(ada, attachment.id)).status).toBe(200);
  });

  it('refuses ids it never made', async () => {
    expect((await download(ada, '../../etc/passwd')).status).toBe(404);
  });
});

describe('the Files page', () => {
  it('lists what each person sent and received', async () => {
    const [adaSocket, graceSocket] = [await connect(ada), await connect(grace)];
    await send(adaSocket, (await uploaded(ada, PNG, 'from-ada.png')).id);
    await send(graceSocket, (await uploaded(grace, PDF, 'from-grace.pdf')).id);
    const names = async (user: TestUser, filter: string) => (await files(user, filter)).files.map(file => file.name);
    expect(await names(ada, 'all')).toEqual(['from-grace.pdf', 'from-ada.png']);
    expect(await names(ada, 'sent')).toEqual(['from-ada.png']);
    expect(await names(ada, 'received')).toEqual(['from-grace.pdf']);
    expect(await names(grace, 'sent')).toEqual(['from-grace.pdf']);
    expect((await files(ada, 'received')).files[0]).toMatchObject({ direction: 'received', other: { id: grace.id, displayName: 'Grace Hopper' } });
    expect(await names(alan, 'all')).toEqual([]);
    expect(await attempt(() => files(ada, 'mine'))).toMatchObject({ status: 400 });
  });

  it('pages through them, newest first', async () => {
    const socket = await connect(ada);
    for (let i = 1; i <= 5; i += 1) await send(socket, (await uploaded(ada, PDF, `${i}.pdf`)).id);
    const first = await files(ada, null, null, 2);
    const second = await files(ada, null, first.nextBefore, 2);
    const third = await files(ada, null, second.nextBefore, 2);
    expect([...first.files, ...second.files, ...third.files].map(file => file.name)).toEqual(['5.pdf', '4.pdf', '3.pdf', '2.pdf', '1.pdf']);
    expect(third.nextBefore).toBeNull();
  });
});

describe('deleting', () => {
  it('for everyone, removes the file from the disk at once', async () => {
    const attachment = await uploaded(ada, PNG, 'photo.png');
    await preview(ada, attachment.id, PNG, { width: 1, height: 1 });
    const message = await send(await connect(ada), attachment.id);
    await deleteMessage(ctx.hub, ada.id, message.id, 'everyone');
    expect(onDisk('files', attachment.id)).toBe(false);
    expect(onDisk('previews', attachment.id)).toBe(false);
    expect((await download(grace, attachment.id)).status).toBe(404);
    expect((await files(grace)).files).toEqual([]);
  });

  it('for me, hides it from me and keeps it for the other person', async () => {
    const attachment = await uploaded(ada, PDF, 'a.pdf');
    const message = await send(await connect(ada), attachment.id);
    await deleteMessage(ctx.hub, ada.id, message.id, 'me');
    await ctx.hub.files.sweep();
    expect((await download(ada, attachment.id)).status).toBe(404);
    expect((await files(ada)).files).toEqual([]);
    expect((await download(grace, attachment.id)).status).toBe(200);
    expect(onDisk('files', attachment.id)).toBe(true);
  });

  it('removes the file once both people have deleted or cleared it', async () => {
    const attachment = await uploaded(ada, PDF, 'a.pdf');
    const message = await send(await connect(ada), attachment.id);
    await deleteMessage(ctx.hub, ada.id, message.id, 'me');
    await clearChat(ctx.hub, grace.id, conversationId);
    expect(await ctx.hub.files.sweep()).toBe(1);
    expect(onDisk('files', attachment.id)).toBe(false);
  });

  it('sweeps an upload never sent, after a day', async () => {
    const fresh = await uploaded(ada, PDF, 'fresh.pdf');
    const stale = await uploaded(ada, PDF, 'stale.pdf');
    await db.query(`update talk_attachments set created_at = now() - interval '25 hours' where id = $1`, [stale.id]);
    expect(await ctx.hub.files.sweep()).toBe(1);
    expect(onDisk('files', stale.id)).toBe(false);
    expect(onDisk('files', fresh.id)).toBe(true);
  });

  it('removes old files on disk no row knows about, and leaves new ones another process may be writing', async () => {
    const kept = await uploaded(ada, PDF, 'kept.pdf');
    const stray = 'AAAAAAAAAAAAAAAAAAAAAA';
    const recent = 'AABBBBBBBBBBBBBBBBBBBB';
    await mkdir(join(ctx.dataRoot, 'files', 'AA'), { recursive: true });
    await writeFile(join(ctx.dataRoot, 'files', 'AA', stray), 'left behind');
    await writeFile(join(ctx.dataRoot, 'files', 'AA', recent), 'arriving');
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(ctx.dataRoot, 'files', 'AA', stray), longAgo, longAgo);
    await utimes(join(ctx.dataRoot, 'files', kept.id.slice(0, 2), kept.id), longAgo, longAgo);

    expect(await ctx.hub.files.sweepDisk()).toBe(1);
    expect(onDisk('files', stray)).toBe(false);
    expect(onDisk('files', recent)).toBe(true);
    expect(onDisk('files', kept.id)).toBe(true);
  });
});

describe('cleanFileName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(cleanFileName(encodeURIComponent('Presupuesto 2026 (final).xlsx'))).toBe('Presupuesto 2026 (final).xlsx');
  });

  it('drops folders and control characters', () => {
    expect(cleanFileName(encodeURIComponent('../../etc/passwd'))).toBe('passwd');
    expect(cleanFileName(encodeURIComponent('C:\\Users\\ada\\a.txt'))).toBe('a.txt');
    expect(cleanFileName(encodeURIComponent('bad\u0000name\n.txt'))).toBe('badname.txt');
    expect(cleanFileName(encodeURIComponent('c1\u0085\u009bname.txt'))).toBe('c1name.txt');
    expect(cleanFileName(undefined)).toBe('file');
    expect(cleanFileName('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('drops invisible format characters, which could make one kind of file read as another', () => {
    // Right-to-left override: shown as "invoiceexe.pdf".
    expect(cleanFileName(encodeURIComponent('invoice‮fdp.exe'))).toBe('invoicefdp.exe');
    // Isolates, marks, zero-width characters and a byte order mark.
    expect(cleanFileName(encodeURIComponent('﻿photo⁦.jpg⁩​‎.exe'))).toBe('photo.jpg.exe');
    expect(cleanFileName(encodeURIComponent('‮⁧'))).toBe('file');
    // Letters of any script stay.
    expect(cleanFileName(encodeURIComponent('תמונה ملف 写真.png'))).toBe('תמונה ملف 写真.png');
  });

  it('is what an upload is kept and offered under', async () => {
    const attachment = await uploaded(ada, Buffer.from('MZ pretend program'), 'invoice‮fdp.exe', 'application/pdf');
    expect(attachment).toMatchObject({ name: 'invoicefdp.exe', isImage: false });
    const response = (await download(ada, attachment.id)).body!;
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('shortens a long name but keeps its extension', () => {
    const name = cleanFileName(encodeURIComponent(`${'a'.repeat(300)}.pdf`));
    expect(name).toHaveLength(200);
    expect(name.endsWith('….pdf')).toBe(true);
  });
});
