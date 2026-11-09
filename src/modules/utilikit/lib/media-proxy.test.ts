import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import type { Duplex } from 'stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mediaProxy, startPublicProxy, type PublicProxy } from '@/modules/utilikit/lib/media-proxy';

/** A local web server standing in for a site, counting who reaches it. */
let site: http.Server;
let sitePort = 0;
let reached = 0;
let lastHeaders: IncomingHttpHeaders = {};

beforeAll(async () => {
  site = http.createServer((request, response) => {
    lastHeaders = request.headers;
    response.end(`hello from ${request.url}`);
  });
  site.on('connection', () => reached++);
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  sitePort = (site.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>(resolve => site.close(() => resolve())));

beforeEach(() => {
  reached = 0;
  lastHeaders = {};
});

const portOf = (proxy: PublicProxy) => Number(new URL(proxy.url).port);
const credentials = (proxy: PublicProxy) => {
  const { username, password } = new URL(proxy.url);
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
};

/** A CONNECT through the proxy: its answer, and the tunnel when it opened one. */
function tunnel(proxy: PublicProxy, authority: string, authorization?: string) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; socket: Duplex }>((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: portOf(proxy),
      method: 'CONNECT',
      path: authority,
      headers: authorization ? { 'Proxy-Authorization': authorization } : {},
    });
    request.on('connect', (response, socket) => resolve({ status: response.statusCode ?? 0, headers: response.headers, socket }));
    request.on('error', reject);
    request.end();
  });
}

/** A plain HTTP request sent to the proxy with the whole URL. */
function viaProxy(proxy: PublicProxy, url: string, authorization?: string) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: portOf(proxy),
      path: url,
      headers: { Host: new URL(url).host, ...(authorization ? { 'Proxy-Authorization': authorization } : {}) },
      agent: false,
    });
    request.on('response', response => {
      let body = '';
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

/** A GET over an open tunnel. */
function getThrough(socket: Duplex, path: string) {
  return new Promise<string>((resolve, reject) => {
    const request = http.request({ createConnection: () => socket, path, headers: { Host: `127.0.0.1:${sitePort}` } });
    request.on('response', response => {
      let body = '';
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('the media proxy', () => {
  let proxy: PublicProxy;
  let open: PublicProxy;

  beforeAll(async () => {
    // The real rules, on the test site's port so that only the address can stop it.
    proxy = await startPublicProxy({ ports: [sitePort] });
    // Every address allowed: what a public site would get.
    open = await startPublicProxy({ isBlocked: () => false, ports: [sitePort] });
  });

  afterAll(async () => {
    await proxy.close();
    await open.close();
  });

  it('listens on 127.0.0.1 with a random token as its password', () => {
    const url = new URL(proxy.url);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.username).toBe('utilikit');
    expect(url.password).toMatch(/^[0-9a-f]{48}$/);
    expect(new URL(open.url).password).not.toBe(url.password);
  });

  it('asks for the token when it is missing', async () => {
    const answer = await tunnel(open, `127.0.0.1:${sitePort}`);
    expect(answer.status).toBe(407);
    expect(answer.headers['proxy-authenticate']).toBe('Basic realm="utilikit"');
    expect((await viaProxy(open, `http://127.0.0.1:${sitePort}/page`)).status).toBe(407);
    expect(reached).toBe(0);
  });

  it('refuses a wrong token or user', async () => {
    const token = new URL(open.url).password;
    for (const wrong of [`utilikit:${'0'.repeat(48)}`, `someone:${token}`, `utilikit:${token}x`, 'utilikit:']) {
      const authorization = `Basic ${Buffer.from(wrong).toString('base64')}`;
      expect((await tunnel(open, `127.0.0.1:${sitePort}`, authorization)).status, wrong).toBe(407);
      expect((await viaProxy(open, `http://127.0.0.1:${sitePort}/page`, authorization)).status, wrong).toBe(407);
    }
    expect((await tunnel(open, `127.0.0.1:${sitePort}`, credentials(proxy))).status).toBe(407);
    expect(reached).toBe(0);
  });

  it('refuses private addresses without connecting', async () => {
    for (const authority of [`127.0.0.1:${sitePort}`, `[::1]:${sitePort}`, `[::ffff:127.0.0.1]:${sitePort}`, `10.0.0.1:${sitePort}`]) {
      expect((await tunnel(proxy, authority, credentials(proxy))).status, authority).toBe(403);
    }
    expect((await viaProxy(proxy, `http://127.0.0.1:${sitePort}/page`, credentials(proxy))).status).toBe(403);
    expect(reached).toBe(0);
  });

  it('refuses names that resolve to private addresses as it connects', async () => {
    expect((await tunnel(proxy, `localhost:${sitePort}`, credentials(proxy))).status).toBe(403);
    expect((await viaProxy(proxy, `http://localhost:${sitePort}/page`, credentials(proxy))).status).toBe(403);
    expect(reached).toBe(0);
  });

  it('connects only to ports 80 and 443', async () => {
    const usual = await startPublicProxy({ isBlocked: () => false });
    try {
      for (const authority of [`127.0.0.1:${sitePort}`, 'example.com:22', 'example.com:8443']) {
        expect((await tunnel(usual, authority, credentials(usual))).status, authority).toBe(403);
      }
      expect((await viaProxy(usual, `http://127.0.0.1:${sitePort}/page`, credentials(usual))).status).toBe(403);
      expect(reached).toBe(0);
    } finally {
      await usual.close();
    }
  });

  it('refuses requests that are not for a host and port', async () => {
    expect((await tunnel(open, 'no-port', credentials(open))).status).toBe(400);
    expect((await viaProxy(open, 'ftp://127.0.0.1/file', credentials(open))).status).toBe(400);
  });

  it('tunnels to an allowed address', async () => {
    const answer = await tunnel(open, `127.0.0.1:${sitePort}`, credentials(open));
    expect(answer.status).toBe(200);
    expect(await getThrough(answer.socket, '/through')).toBe('hello from /through');
    answer.socket.destroy();
  });

  it('forwards plain HTTP without passing its token on', async () => {
    const answer = await viaProxy(open, `http://127.0.0.1:${sitePort}/plain?x=1`, credentials(open));
    expect(answer).toMatchObject({ status: 200, body: 'hello from /plain?x=1' });
    expect(lastHeaders['proxy-authorization']).toBeUndefined();
    expect(lastHeaders.host).toBe(`127.0.0.1:${sitePort}`);
  });
});

describe('mediaProxy', () => {
  it('starts one proxy per process', async () => {
    const first = await mediaProxy();
    expect(await mediaProxy()).toBe(first);
    expect(first.url).toMatch(/^http:\/\/utilikit:[0-9a-f]{48}@127\.0\.0\.1:\d+$/);
  });
});
