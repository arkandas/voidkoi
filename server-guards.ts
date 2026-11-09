/**
 * Checks `server.ts` makes on every request before Next sees it. Kept apart,
 * and free of Next, so tests can import them.
 */
import { isIP } from 'node:net';

type Headers = Record<string, string | string[] | undefined>;

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A request's path as the router will see it: percent-decoded, dot segments
 * resolved. Null when it can't be decoded, which nothing legitimate sends.
 */
export function routedPath(url: string | undefined): string | null {
  const raw = (url ?? '/').split('?')[0]!;
  try {
    return new URL(decodeURIComponent(raw).replace(/\\/g, '/'), 'http://suite.invalid').pathname;
  } catch {
    return null;
  }
}

/** Writes that come from other sites on purpose: NextAuth's own routes check a token of their own, and the share sheet posts to the share target. */
const CROSS_SITE_WRITES = [/^\/api\/auth\//, /^\/share-target\/?$/];

/**
 * Whether a request is a browser's write from another site, which the suite
 * refuses: a page on a sibling subdomain counts as the same site for cookies,
 * so SameSite alone doesn't stop it. Every path is covered, judged as the
 * router sees it, so an encoded or dotted spelling of an API path can't slip
 * past. Requests that aren't from a browser carry no cookies, and pass.
 */
export function crossSiteWrite(method: string | undefined, url: string | undefined, headers: Headers, publicOrigin: string | null): boolean {
  if (!WRITES.has((method ?? 'GET').toUpperCase())) return false;
  const path = routedPath(url);
  if (path !== null && CROSS_SITE_WRITES.some(pattern => pattern.test(path))) return false;

  const site = header(headers, 'sec-fetch-site');
  if (site !== undefined) return site !== 'same-origin' && site !== 'none';

  const origin = header(headers, 'origin');
  if (origin === undefined) return false;
  const expected = publicOrigin ?? `${header(headers, 'x-forwarded-proto') === 'https' ? 'https' : 'http'}://${header(headers, 'host') ?? ''}`;
  return origin !== expected;
}

/** The origin the suite is served from, from its public URL. Null when it isn't set. */
export function publicOriginOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isPrivate(address: string): boolean {
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
  }
  return false;
}

/**
 * The address a request came from. Behind a reverse proxy on the same network
 * (the connection comes from a private address), the last address the proxy
 * added to X-Forwarded-For; anything before it is the client's own claim.
 * Otherwise the connection's own address.
 */
export function clientOf(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined): string {
  const peer = remoteAddress ?? '';
  const list = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? ''))
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (peer && isPrivate(peer) && list.length > 0) return list[list.length - 1]!;
  return peer || 'local';
}

/** NextAuth's own routes read whole bodies before checking anything; these are small forms. */
const AUTH_BODY_LIMIT = 64 * 1024;

/**
 * A status to refuse a write to NextAuth's routes with, when its body is
 * missing a length or is larger than any sign-in form. Null to let it through.
 */
export function oversizedAuthBody(method: string | undefined, url: string | undefined, headers: Headers): 411 | 413 | null {
  if (!WRITES.has((method ?? 'GET').toUpperCase())) return null;
  const path = routedPath(url);
  if (path === null || !path.startsWith('/api/auth/')) return null;
  const length = header(headers, 'content-length');
  if (length === undefined) return header(headers, 'transfer-encoding') === undefined ? null : 411;
  const bytes = Number(length);
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= AUTH_BODY_LIMIT ? null : 413;
}
