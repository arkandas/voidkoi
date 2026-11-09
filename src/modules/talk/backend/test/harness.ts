/**
 * The tests' Talk: a hub on PGlite with the real schema, files in a temp
 * folder, notifications kept instead of sent, and, when asked, an HTTP server
 * that hands Talk's socket the upgrades the way `server.ts` does. People are
 * rows in `users`, with real session cookies.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encode } from 'next-auth/jwt';

import { sessionCookieName } from '@/lib/auth-cookies';
import { ApiError } from '@/lib/error-codes';

import type { TalkConfig } from '../config';
import { createHub, type TalkHub } from '../hub';
import { SOCKET_PATH } from '../jobs';
import { socketAccount } from '../realtime/socket-auth';
import { createTestDatabase, type TestDatabase } from './database';
import { RecordingPushService } from './push-device';

export const TEST_SECRET = 'talk-tests-secret';

export interface TestContext {
  hub: TalkHub;
  db: TestDatabase;
  push: RecordingPushService;
  dataRoot: string;
  /** Set when the context listens, for the socket tests. */
  baseUrl: string | null;
  close(): Promise<void>;
}

export interface TestUser {
  id: number;
  username: string;
  displayName: string;
  /** The suite's session cookie, as a browser would send it. */
  cookie: string;
}

export interface ContextOptions {
  listen?: boolean;
  ringTimeoutMs?: number;
  maxUploadBytes?: number;
  uploadQuotaBytes?: number;
}

/** One PGlite for a whole test file; `fresh` empties it and makes a new hub for each test. */
export async function testDatabase(): Promise<TestDatabase> {
  return createTestDatabase();
}

export async function createTestContext(db: TestDatabase, options: ContextOptions = {}): Promise<TestContext> {
  await db.reset();
  const dataRoot = await mkdtemp(join(tmpdir(), 'voidkoi-talk-files-'));
  const push = new RecordingPushService();
  const config: TalkConfig = {
    stunPort: 0,
    iceServers: null,
    ringTimeoutMs: options.ringTimeoutMs ?? 1000,
    maxUploadBytes: options.maxUploadBytes ?? 1024 * 1024,
    uploadQuotaBytes: options.uploadQuotaBytes ?? 10 * 1024 * 1024 * 1024,
    pushContact: 'mailto:talk@localhost',
  };
  const hub = await createHub({
    db,
    config,
    dataRoot,
    pushTransport: push.transport,
    authenticate: request => socketAccount(request, db, TEST_SECRET),
    log: () => {},
  });

  let server: Server | null = null;
  let baseUrl: string | null = null;
  if (options.listen) {
    server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    server.on('upgrade', (request, socket, head) => {
      if (request.url?.split('?')[0] === SOCKET_PATH) hub.upgrade(request, socket, head);
      else socket.destroy();
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`;
  }

  return {
    hub,
    db,
    push,
    dataRoot,
    baseUrl,
    async close() {
      await hub.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>(resolve => server!.close(() => resolve()));
      }
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

/** A session cookie, good for NextAuth's thirty days unless `maxAgeSeconds` says otherwise. */
export async function sessionCookie(userId: number, sessionVersion = 0, maxAgeSeconds?: number): Promise<string> {
  const token = await encode({
    token: { id: String(userId), sv: sessionVersion, role: 'USER' },
    secret: TEST_SECRET,
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
  });
  return `${sessionCookieName}=${token}`;
}

/** An account, straight into `users`. It uses Talk unless `apps` says otherwise. */
export async function seedUser(
  ctx: Pick<TestContext, 'db'>,
  username: string,
  options: { name?: string | null; apps?: string[]; locale?: string } = {},
): Promise<TestUser> {
  const { rows } = await ctx.db.query<{ id: number }>(
    `insert into users (username, email, name, apps, apps_chosen_at, locale, updated_at)
     values ($1, $2, $3, $4, now(), $5, now()) returning id`,
    [username, `${username}@example.com`, options.name === undefined ? username : options.name, options.apps ?? ['talk'], options.locale ?? null],
  );
  const id = rows[0]!.id;
  return { id, username, displayName: options.name ?? username, cookie: await sessionCookie(id) };
}

/** What a route would answer: the result, or the status and code of the error it threw. */
export async function attempt<T>(work: () => Promise<T>): Promise<{ status: number; code: string | null; body: T | null }> {
  try {
    return { status: 200, code: null, body: await work() };
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code, body: null };
    throw error;
  }
}

export function settle(ms = 150): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
