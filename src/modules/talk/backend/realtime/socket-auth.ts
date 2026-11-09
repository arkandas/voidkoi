/**
 * Who a socket belongs to: the suite's session cookie on the upgrade request,
 * read the way NextAuth reads it, and the account it names, as long as it
 * still exists, its sign-ins haven't been ended since, and it uses Talk. The
 * socket lasts no longer than the session: `expiresAt` is when it runs out.
 */
import type { IncomingMessage } from 'node:http';
import { getToken } from 'next-auth/jwt';

import { sessionCookieName } from '@/lib/auth-cookies';

import type { Queryable } from '../db';

export type SocketAccount = { userId: number; sessionVersion: number; expiresAt: number } | { refused: 401 | 403 };

/** The cookies of a raw request, by name. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === '' || cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

type TokenRequest = Parameters<typeof getToken>[0]['req'];

export async function socketAccount(request: IncomingMessage, db: Queryable, secret = process.env.VOIDKOI_NEXTAUTH_SECRET): Promise<SocketAccount> {
  if (!secret) return { refused: 401 };
  // A long session is split over several cookies; getToken puts them back together.
  const cookies = parseCookies(request.headers.cookie);
  const token = await getToken({ req: { cookies, headers: {} } as unknown as TokenRequest, secret, cookieName: sessionCookieName });
  const id = Number(token?.id);
  if (!token || !Number.isInteger(id)) return { refused: 401 };
  // Seconds, as JWT keeps it. Reading the token forgives a few seconds past
  // it; a socket opened then would only be closed straight away.
  const expiresAt = typeof token.exp === 'number' ? token.exp * 1000 : NaN;
  if (!(expiresAt > Date.now())) return { refused: 401 };

  const sessionVersion = token.sv ?? 0;
  const refused = await accountRefusal(db, id, sessionVersion);
  return refused ? { refused } : { userId: id, sessionVersion, expiresAt };
}

/**
 * Why an account may not have a socket (any more): it is gone, its sign-ins
 * were ended since (a new password), or it no longer uses Talk. Null while it may.
 */
export async function accountRefusal(db: Queryable, userId: number, sessionVersion: number): Promise<401 | 403 | null> {
  const { rows } = await db.query<{ session_version: number; apps: string[] }>('select session_version, apps from users where id = $1', [userId]);
  const user = rows[0];
  if (!user || sessionVersion !== user.session_version) return 401;
  return user.apps.includes('talk') ? null : 403;
}

/**
 * A page on another site can open a WebSocket here and the browser would send
 * the cookie along. Only this site's own pages may: the address it is served
 * at, or the public one it is configured with.
 */
export function sameOrigin(request: IncomingMessage, publicUrl = process.env.VOIDKOI_NEXTAUTH_URL ?? process.env.NEXTAUTH_URL): boolean {
  const origin = request.headers.origin;
  // Not a browser: nothing to protect it from.
  if (origin === undefined) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  for (const header of [request.headers.host, request.headers['x-forwarded-host']]) {
    const value = Array.isArray(header) ? header[0] : header;
    if (value) hosts.add(value.split(',')[0]!.trim());
  }
  try {
    if (publicUrl) hosts.add(new URL(publicUrl).host);
  } catch {
    // Not a URL; the request's own host still counts.
  }
  return hosts.has(originHost);
}
