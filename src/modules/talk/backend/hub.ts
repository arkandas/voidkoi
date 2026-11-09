/**
 * Everything Talk keeps while the server runs: who is connected, the calls
 * going on, the push keys, and the files on disk. One for the whole process,
 * kept on `globalThis`, so the socket and every route see the same one even
 * when the bundler gives them their own copies of this module.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { dataPath } from '@/lib/storage';
import type { PresenceUser } from '@/modules/talk/lib/protocol';

import { loadConfig, type TalkConfig } from './config';
import { createPostgresDatabase, type Database } from './db';
import { FileService } from './files/service';
import { FileStore } from './files/store';
import { missedCallNotification, ringingNotification } from './push/notifications';
import { fetchTransport, PushService, type PushTransport } from './push/service';
import { loadOrInsertPushKeys } from './push/store';
import { generateVapidKeys, loadVapidKeys } from './push/vapid';
import { CallManager } from './realtime/call-manager';
import { PresenceRegistry } from './realtime/presence';
import { Signaling, type SignalingDeps } from './realtime/signaling';
import { listTalkUsers } from './users';

export interface TalkHub {
  db: Database;
  config: TalkConfig;
  presence: PresenceRegistry;
  calls: CallManager;
  push: PushService;
  files: FileService;
  /** Everyone who uses Talk, with whether they have it open. */
  directory(): Promise<PresenceUser[]>;
  /** Send everyone who is connected the directory again, e.g. after someone's status changed. */
  refreshPresence(): void;
  /** Take over an upgrade request for Talk's socket. */
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  close(): Promise<void>;
}

export interface HubOptions {
  db: Database;
  config: TalkConfig;
  /** Where attachments and group photos live. */
  dataRoot: string;
  /** How notifications leave the process; the tests keep them. */
  pushTransport?: PushTransport;
  /** Who a socket belongs to; the suite's session unless a test says otherwise. */
  authenticate?: SignalingDeps['authenticate'];
  log?: (message: string, error?: unknown) => void;
}

const defaultLog = (message: string, error?: unknown): void => {
  if (error === undefined) console.warn(message);
  else console.warn(message, error);
};

export async function createHub({ db, config, dataRoot, pushTransport = fetchTransport, authenticate, log = defaultLog }: HubOptions): Promise<TalkHub> {
  const presence = new PresenceRegistry();
  const directory = async (): Promise<PresenceUser[]> => presence.snapshot(await listTalkUsers(db));
  const refreshPresence = (): void => {
    void directory()
      .then(users => presence.broadcast({ type: 'presence', users }))
      .catch(error => log('Talk: sending who is online failed', error));
  };

  const push = new PushService(db, loadVapidKeys(await loadOrInsertPushKeys(db, generateVapidKeys)), config.pushContact, pushTransport, log);

  const store = new FileStore(dataRoot);
  await store.init();
  const files = new FileService(db, store, log);

  // A notification is for someone who isn't already looking at Talk.
  const notifyUnlessWatching = (userId: number, send: () => Promise<void>): void => {
    if (presence.isWatching(userId)) return;
    void send().catch(error => log('Talk: a call notification failed', error));
  };

  const calls = new CallManager(db, presence, config.ringTimeoutMs, {
    onPresenceChanged: refreshPresence,
    log: message => log(message),
    canWake: userId => push.hasDevices(userId),
    ringing: call =>
      notifyUnlessWatching(call.calleeId, () =>
        push.notify(call.calleeId, locale =>
          ringingNotification(
            { callId: call.id, callerName: call.callerName, media: call.media, ringSeconds: Math.ceil(config.ringTimeoutMs / 1000) },
            locale,
          ),
        ),
      ),
    missed: call =>
      notifyUnlessWatching(call.calleeId, () =>
        push.notify(call.calleeId, locale => missedCallNotification({ callId: call.id, callerName: call.callerName, media: call.media }, locale)),
      ),
  });

  const signaling = new Signaling({ db, presence, calls, push, directory, refreshPresence, log, authenticate });

  return {
    db,
    config,
    presence,
    calls,
    push,
    files,
    directory,
    refreshPresence,
    upgrade: (request, socket, head) => signaling.upgrade(request, socket, head),
    async close() {
      signaling.close();
      presence.closeAll();
      calls.shutdown();
      await db.close();
    },
  };
}

const HUB = Symbol.for('voidkoi.talk.hub');

/** The process's hub, made on first use. */
export function talkHub(): Promise<TalkHub> {
  const scope = globalThis as { [HUB]?: Promise<TalkHub> };
  const existing = scope[HUB];
  if (existing) return existing;

  const url = process.env.VOIDKOI_DATABASE_URL;
  const made = url
    ? createHub({ db: createPostgresDatabase(url), config: loadConfig(), dataRoot: dataPath('talk') })
    : Promise.reject(new Error('VOIDKOI_DATABASE_URL is not set.'));
  scope[HUB] = made;
  // A hub that failed to start is tried again on the next request.
  made.catch(() => {
    if (scope[HUB] === made) delete scope[HUB];
  });
  return made;
}
