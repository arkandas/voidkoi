/**
 * Talk's socket: who it belongs to, and what it says. The session is checked
 * before the upgrade completes, so a request without one gets an HTTP 401 and
 * never becomes a WebSocket. There is no `join` message: by the time the
 * socket opens the server knows whose it is, and says so with `welcome`.
 */
import { STATUS_CODES, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { MESSAGE_MAX, parseClientMessage, type ClientMessage, type ClientMessageType, type PresenceUser } from '@/modules/talk/lib/protocol';

import { claimAttachment, type AttachmentRow } from '../attachments';
import { findConversation, isActiveMember, listMemberIds, restoreConversation, totalUnread } from '../conversations';
import type { Database } from '../db';
import { insertMessage, toChatMessage, type MessageRow } from '../messages';
import { messageNotification } from '../push/notifications';
import type { PushService } from '../push/service';
import { findUser } from '../users';
import type { CallManager } from './call-manager';
import { createConnection, type Connection, type PresenceRegistry } from './presence';
import { accountRefusal, sameOrigin, socketAccount, type SocketAccount } from './socket-auth';
import { TokenBucket } from './token-bucket';

/** Close code for a socket a newer one of the same account took over from. */
const CLOSE_REPLACED = 4000;

/** Close code for a socket whose account was deleted, signed out everywhere, or stopped using Talk, or whose session ran out. */
const CLOSE_SIGNED_OUT = 4001;

/** How often an open socket's account is looked at again. */
const RECHECK_MS = 60_000;

/** The longest a timer can wait, about 24.8 days. A session can last longer. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * How many of these frames an account may send a minute, all at once if it
 * likes: far more than anyone talking or calling sends, too few to ring
 * someone over and over or flood a chat. Past it they are dropped.
 */
const FRAMES_PER_MINUTE: Partial<Record<ClientMessageType, number>> = { 'call-offer': 10, chat: 60 };

export interface SignalingDeps {
  db: Database;
  presence: PresenceRegistry;
  calls: CallManager;
  push: PushService;
  /** The directory with live status, sent with `welcome` and `presence`. */
  directory(): Promise<PresenceUser[]>;
  refreshPresence(): void;
  log(message: string, error?: unknown): void;
  /** Who a request is; the suite's session cookie unless a test says otherwise. */
  authenticate?(request: IncomingMessage): Promise<SocketAccount>;
}

/** The upgrade has to be answered on the raw socket when it is refused. */
function refuse(socket: Duplex, status: number): void {
  const body = JSON.stringify({ error: status === 403 ? 'forbidden' : 'unauthorized' });
  socket.write(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
  socket.destroy();
}

function text(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

/** The upload isn't this sender's, isn't for this conversation, or was already sent. */
class UnsendableFile extends Error {}

export class Signaling {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  /** What each account has left of FRAMES_PER_MINUTE. By account, so a new socket doesn't start afresh. */
  private readonly budgets = new Map<number, Map<ClientMessageType, TokenBucket>>();

  constructor(private readonly deps: SignalingDeps) {}

  /** Take over an upgrade request for Talk's socket. */
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => undefined);
    void (async () => {
      if (!sameOrigin(request)) return refuse(socket, 403);
      const account = await (this.deps.authenticate ?? (req => socketAccount(req, this.deps.db)))(request);
      if ('refused' in account) return refuse(socket, account.refused);
      this.server.handleUpgrade(request, socket, head, ws => this.open(ws, account.userId, account.sessionVersion, account.expiresAt));
    })().catch(error => {
      this.deps.log('Talk: a socket could not be opened', error);
      refuse(socket, 500);
    });
  }

  close(): void {
    for (const client of this.server.clients) client.terminate();
    this.server.close();
  }

  private open(socket: WebSocket, userId: number, sessionVersion: number, expiresAt: number): void {
    const { db, presence, calls, log } = this.deps;
    const connection = createConnection(userId, socket);
    const replaced = presence.add(connection);

    if (replaced) {
      replaced.send({ type: 'replaced' });
      try {
        replaced.socket.close(CLOSE_REPLACED, 'replaced by a newer connection');
      } catch {
        // Already gone.
      }
    }

    void this.deps
      .directory()
      .then(users => {
        const me = users.find(user => user.id === userId);
        if (me) connection.send({ type: 'welcome', me: { ...me, status: presence.statusOf(userId) }, users });
        presence.broadcast({ type: 'presence', users });
        // After welcome, so the page has its bearings before a call lands.
        calls.redeliver(connection);
      })
      .catch(error => log('Talk: welcoming a socket failed', error));

    socket.on('message', raw => {
      // Any frame at all says the page is alive; see PresenceRegistry.isWatching.
      connection.lastSeenAt = Date.now();
      const message = parseClientMessage(text(raw));
      if (!message) {
        connection.send({ type: 'error', code: 'bad_message', message: 'Unrecognised message.' });
        return;
      }
      if (!this.withinBudget(userId, message.type)) {
        // Dropped. The page that sent it hears, so it takes back the bubble or stops calling.
        const clientId = message.type === 'chat' ? { clientId: message.clientId } : {};
        connection.send({ type: 'error', code: 'rate_limited', message: 'Too many at once. Wait a moment.', ...clientId });
        return;
      }
      void this.handle(connection, message).catch(error => {
        log(`Talk: handling a "${message.type}" frame failed`, error);
        connection.send({ type: 'error', code: 'internal', message: 'Something went wrong handling that.' });
      });
    });

    // The session was checked once, at the upgrade; an account deleted or
    // signed out everywhere since loses its socket within a minute.
    const recheck = setInterval(() => {
      void accountRefusal(db, userId, sessionVersion)
        .then(refused => {
          if (refused) socket.close(CLOSE_SIGNED_OUT, 'signed out');
        })
        .catch(error => log('Talk: checking a socket\'s account failed', error));
    }, RECHECK_MS);
    recheck.unref();

    // Nor does it outlive the session it was opened with. A page still signed
    // in comes back with its newer one.
    let expiry: NodeJS.Timeout | undefined;
    const expire = (): void => {
      const left = expiresAt - Date.now();
      if (left <= 0) {
        socket.close(CLOSE_SIGNED_OUT, 'session expired');
        return;
      }
      expiry = setTimeout(expire, Math.min(left, MAX_TIMER_MS));
      expiry.unref();
    };

    socket.on('close', () => {
      clearInterval(recheck);
      clearTimeout(expiry);
      const removed = presence.remove(connection);
      void calls.handleDisconnect(userId).catch(error => log('Talk: ending the call of a closed socket failed', error));
      if (removed) this.deps.refreshPresence();
    });

    socket.on('error', error => log('Talk: socket error', error));
    expire();
  }

  /** Whether a frame is within its account's budget, using up one of it if so. */
  private withinBudget(userId: number, type: ClientMessageType): boolean {
    const perMinute = FRAMES_PER_MINUTE[type];
    if (perMinute === undefined) return true;
    const now = performance.now();
    let buckets = this.budgets.get(userId);
    if (!buckets) this.budgets.set(userId, (buckets = new Map()));
    let bucket = buckets.get(type);
    if (!bucket) buckets.set(type, (bucket = new TokenBucket(perMinute, perMinute / 60, now)));
    return bucket.take(now);
  }

  private async handle(connection: Connection, message: ClientMessage): Promise<void> {
    const { calls } = this.deps;
    switch (message.type) {
      case 'ping':
        connection.send({ type: 'pong' });
        return;
      case 'visibility':
        connection.visible = message.visible;
        return;
      case 'chat':
        await this.chat(connection, message.conversationId, message.text, message.clientId, message.attachmentId ?? null);
        return;
      case 'call-offer':
        await calls.offer(connection, message.to, message.sdp, message.media ?? 'audio');
        return;
      case 'call-accept':
        await calls.accept(connection, message.callId, message.sdp);
        return;
      case 'call-decline':
        await calls.decline(connection, message.callId);
        return;
      case 'call-cancel':
        await calls.cancel(connection, message.callId);
        return;
      case 'hangup':
        await calls.hangup(connection, message.callId);
        return;
      case 'ice-candidate':
        calls.relayCandidate(connection, message.callId, message.candidate);
        return;
      case 'camera-state':
        calls.relayCameraState(connection, message.callId, message.on);
        return;
    }
  }

  private async chat(connection: Connection, conversationId: number, rawText: string, clientId: string, attachmentId: string | null): Promise<void> {
    const { db, presence, log } = this.deps;
    const userId = connection.userId;
    const text = rawText.trim();
    // A file needs no words with it; words need no file.
    if (text.length === 0 && attachmentId === null) {
      connection.send({ type: 'error', code: 'bad_message', message: 'Message is empty.', clientId });
      return;
    }
    if (text.length > MESSAGE_MAX) {
      connection.send({ type: 'error', code: 'too_long', message: `Messages are limited to ${MESSAGE_MAX} characters.`, clientId });
      return;
    }

    // In it now: a group someone has left can be read, not written in.
    if (!(await isActiveMember(db, conversationId, userId))) {
      connection.send({ type: 'error', code: 'unknown_conversation', message: 'You are not in that conversation.', clientId });
      return;
    }

    // The message and the file it sends, together or not at all: the claim
    // stops one upload being sent twice, or into another conversation.
    let sent: { row: MessageRow; attachment: AttachmentRow | null } | null;
    try {
      sent = await db.transaction(async tx => {
        const row = await insertMessage(tx, conversationId, userId, text);
        // Something new was said: a chat anyone had deleted is back.
        await restoreConversation(tx, conversationId);
        if (attachmentId === null) return { row, attachment: null };
        const attachment = await claimAttachment(tx, attachmentId, userId, conversationId, row.id);
        if (!attachment) throw new UnsendableFile();
        return { row, attachment };
      });
    } catch (error) {
      if (!(error instanceof UnsendableFile)) throw error;
      sent = null;
    }
    if (!sent) {
      connection.send({ type: 'error', code: 'bad_attachment', message: 'That file cannot be sent. Try attaching it again.', clientId });
      return;
    }

    const { row, attachment } = sent;
    const stored = toChatMessage(row, attachment);
    const members = await listMemberIds(db, conversationId);
    for (const memberId of members) {
      presence.sendTo(memberId, memberId === userId ? { type: 'message', message: stored, clientId } : { type: 'message', message: stored });
    }

    // Anyone not looking gets a notification instead. Not awaited: a slow push service never holds up the conversation.
    for (const memberId of members) {
      if (memberId === userId || presence.isWatching(memberId)) continue;
      void this.notify(memberId, userId, conversationId, text, attachment, row.created_at).catch(error =>
        log('Talk: a message notification failed', error),
      );
    }
  }

  private async notify(recipientId: number, senderId: number, conversationId: number, text: string, attachment: AttachmentRow | null, at: Date): Promise<void> {
    const { db, push } = this.deps;
    if (!(await push.hasDevices(recipientId))) return;
    const [unread, conversation, sender] = await Promise.all([totalUnread(db, recipientId), findConversation(db, conversationId), findUser(db, senderId)]);
    const groupName = conversation && !conversation.is_direct ? (conversation.name ?? null) : null;
    // The words are the sender's own; only "Photo" for a file without any needs the recipient's language.
    await push.notify(recipientId, locale =>
      messageNotification(
        {
          conversationId,
          senderId,
          senderName: sender?.display_name ?? '',
          groupName,
          text,
          attachment: attachment ? { name: attachment.file_name, isImage: attachment.is_image } : null,
          unread,
          at,
        },
        locale,
      ),
    );
  }
}
