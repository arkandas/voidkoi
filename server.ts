/**
 * The suite's server: Next.js, and on the same port the WebSocket endpoints
 * the apps keep, like Talk's. One process, so a route and a socket share what
 * an app holds in memory, such as who is online and the calls going on.
 *
 * An app registers an endpoint from its jobs, once Next has started them:
 * `globalThis[Symbol.for('voidkoi.sockets')].set(path, handler)`. Talk also
 * starts its STUN server there, on VOIDKOI_STUN_PORT (UDP, 3478).
 *
 * `npm run dev` runs this with tsx; the image runs it with Node, which strips
 * the types. In production it serves the standalone build it sits in.
 */
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import next from 'next';

import { clientOf, crossSiteWrite, oversizedAuthBody, publicOriginOf } from './server-guards.ts';

type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0');

const sockets = new Map<string, UpgradeHandler>();
(globalThis as Record<symbol, unknown>)[Symbol.for('voidkoi.sockets')] = sockets;

async function main(): Promise<void> {
  if (!dev) {
    // The build keeps its configuration here, so next.config.ts isn't needed at runtime.
    const distDir = process.env.NEXT_DIST_DIR || '.next';
    const { config } = JSON.parse(readFileSync(`${distDir}/required-server-files.json`, 'utf8')) as { config: unknown };
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  }

  const app = next({ dev, hostname, port, ...(dev ? { turbopack: true } : {}) });
  const handle = app.getRequestHandler();
  await app.prepare();
  // Next's handler for its own sockets in development: the page reloading itself and, since Next 16, the data a
  // page starts from. It isn't in Next's types; where it's missing, those sockets are refused and the page tries again.
  const nextUpgrade = dev ? (app as unknown as { upgradeHandler?: UpgradeHandler }).upgradeHandler : undefined;
  const unavailable = (socket: Duplex): void => {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n', () => socket.destroy());
  };

  const publicOrigin = publicOriginOf(process.env.VOIDKOI_NEXTAUTH_URL ?? process.env.NEXTAUTH_URL);
  const server = createServer((request, response) => {
    if (crossSiteWrite(request.method, request.url, request.headers, publicOrigin)) {
      response.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"forbidden"}');
      return;
    }
    const refused = oversizedAuthBody(request.method, request.url, request.headers);
    if (refused) {
      response.writeHead(refused, { Connection: 'close' }).end();
      return;
    }
    // Rate limits read this; whatever the client sent under the same name is replaced.
    request.headers['x-voidkoi-client'] = clientOf(request.socket.remoteAddress, request.headers['x-forwarded-for']);
    void handle(request, response);
  });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (request.url ?? '/').split('?')[0]!;
    // Next's own, in development only. In production nothing answers them, so they're closed below.
    if (dev && path.startsWith('/_next/')) {
      // Next listens for them here only from the first request it handles. A page left open across a restart asks
      // before that, and Chrome opens one socket to a host at a time: one left unanswered would hold up the rest,
      // the reloaded page's own too, until Chrome gives up on it after four minutes. So until then they go to Next
      // from here.
      if (server.listenerCount('upgrade') > 1) return;
      if (nextUpgrade) nextUpgrade(request, socket, head);
      else unavailable(socket);
      return;
    }
    const handler = sockets.get(path);
    if (handler) {
      handler(request, socket, head);
    } else {
      // Not one of ours, or the app hasn't registered it yet: the page tries again.
      unavailable(socket);
    }
  });

  server.listen(port, hostname, () => console.log(`> Ready on http://${hostname}:${port}`));

  const stop = (): void => {
    server.close();
    void app.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
