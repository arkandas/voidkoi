/**
 * Talk's settings from the environment, read once so a bad value fails
 * loudly at startup rather than at the first call.
 *
 *   VOIDKOI_STUN_PORT    UDP port of the STUN server that runs with Talk (3478).
 *   VOIDKOI_ICE_SERVERS  The ICE servers browsers use instead of that one, as the
 *                        JSON `RTCPeerConnection` takes: [{"urls":"turn:…","username":…}].
 */
import type { IceServer } from '@/modules/talk/lib/protocol';

export class ConfigError extends Error {}

export interface TalkConfig {
  stunPort: number;
  /** Set when browsers are to use other ICE servers than Talk's own STUN server. */
  iceServers: IceServer[] | null;
  /** How long a call rings before it counts as unanswered. */
  ringTimeoutMs: number;
  /** The largest file anyone can share. It streams to disk, so a big one costs disk, not memory. */
  maxUploadBytes: number;
  /** The most an account's shared files may add up to, counting those still kept. */
  uploadQuotaBytes: number;
  /** Who push services can contact about this server: a `mailto:` or `https:` URL. */
  pushContact: string;
}

type Env = Record<string, string | undefined>;

export const DEFAULT_STUN_PORT = 3478;

export function parseStunPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_STUN_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`VOIDKOI_STUN_PORT must be a port number, not "${raw}".`);
  }
  return port;
}

/** VOIDKOI_ICE_SERVERS, in exactly the shape `RTCPeerConnection` takes, so it goes to the browser untouched. */
export function parseIceServers(raw: string | undefined): IceServer[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('VOIDKOI_ICE_SERVERS must be JSON.');
  }
  if (!Array.isArray(parsed)) throw new ConfigError('VOIDKOI_ICE_SERVERS must be a JSON array.');
  return parsed.map((entry, index): IceServer => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ConfigError(`VOIDKOI_ICE_SERVERS[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const urls = record['urls'];
    const urlsOk = typeof urls === 'string' || (Array.isArray(urls) && urls.length > 0 && urls.every(url => typeof url === 'string'));
    if (!urlsOk) throw new ConfigError(`VOIDKOI_ICE_SERVERS[${index}].urls must be a string or a list of them.`);
    const server: IceServer = { urls: urls as string | string[] };
    for (const key of ['username', 'credential'] as const) {
      if (record[key] === undefined) continue;
      if (typeof record[key] !== 'string') throw new ConfigError(`VOIDKOI_ICE_SERVERS[${index}].${key} must be a string.`);
      server[key] = record[key];
    }
    return server;
  });
}

/** Push services refuse a sender that isn't a `mailto:` or an `https:` URL: the server's own address, where there is one. */
export function pushContact(publicUrl: string | undefined): string {
  const origin = (() => {
    try {
      return publicUrl ? new URL(publicUrl).origin : '';
    } catch {
      return '';
    }
  })();
  return origin.startsWith('https://') ? origin : 'mailto:talk@localhost';
}

export function loadConfig(env: Env = process.env): TalkConfig {
  return {
    stunPort: parseStunPort(env.VOIDKOI_STUN_PORT),
    iceServers: parseIceServers(env.VOIDKOI_ICE_SERVERS),
    ringTimeoutMs: 30_000,
    maxUploadBytes: 1024 * 1024 * 1024,
    uploadQuotaBytes: 10 * 1024 * 1024 * 1024,
    pushContact: pushContact(env.VOIDKOI_NEXTAUTH_URL ?? env.NEXTAUTH_URL),
  };
}

/**
 * The ICE servers for a browser that reached the server at `host`: Talk's own
 * STUN server on the same machine, under the same name, unless configured
 * otherwise.
 */
export function iceServersFor(config: Pick<TalkConfig, 'iceServers' | 'stunPort'>, host: string | null): IceServer[] {
  if (config.iceServers) return config.iceServers;
  const hostname = hostnameOf(host);
  return hostname && config.stunPort > 0 ? [{ urls: `stun:${hostname}:${config.stunPort}` }] : [];
}

/** The name in a Host header, without its port: `example.com`, `192.168.1.5`, `[::1]`. */
export function hostnameOf(host: string | null): string | null {
  const value = host?.split(',')[0]?.trim() ?? '';
  if (value === '') return null;
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(0, end + 1) : null;
  }
  const name = value.split(':')[0]!;
  return /^[A-Za-z0-9.-]+$/.test(name) ? name : null;
}
