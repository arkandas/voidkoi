/**
 * What Talk runs while the server is up: the sweeps that remove files nobody
 * can see any more and, when `server.ts` serves the suite, its socket and its
 * STUN server, in the same process.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { abandonOpenCalls } from './calls';
import { talkHub } from './hub';
import { startStunServer } from './realtime/stun';

/** Where Talk's socket is. Not a route of the app: `server.ts` hands it the upgrade. */
export const SOCKET_PATH = '/api/talk/socket';

type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * The WebSocket endpoints of the process, by path, which `server.ts` puts on
 * `globalThis` before Next starts. Absent under plain `next dev` or
 * `next start`: then there is no socket to serve, and no calls.
 */
function socketEndpoints(): Map<string, UpgradeHandler> | undefined {
  return (globalThis as { [key: symbol]: unknown })[Symbol.for('voidkoi.sockets')] as Map<string, UpgradeHandler> | undefined;
}

let started = false;

export async function startTalkJobs(): Promise<void> {
  if (started) return;
  started = true;
  const hub = await talkHub();

  const sweep = async (): Promise<void> => {
    const strays = await hub.files.sweepDisk();
    if (strays > 0) console.log(`Talk: removed ${strays} file(s) left behind by an earlier run`);
    const removed = await hub.files.sweep();
    if (removed > 0) console.log(`Talk: removed ${removed} file(s) nobody can see`);
  };
  void sweep().catch(error => console.error('Talk: removing files nobody can see failed:', error));
  hub.files.start();

  const endpoints = socketEndpoints();
  if (!endpoints) return;

  // Calls still marked as going on belong to a process that stopped: nobody is talking.
  const abandoned = await abandonOpenCalls(hub.db);
  if (abandoned > 0) console.log(`Talk: closed ${abandoned} call(s) left open by an earlier run`);
  endpoints.set(SOCKET_PATH, hub.upgrade);

  if (hub.config.stunPort > 0) {
    await startStunServer({ port: hub.config.stunPort, log: message => console.log(message) }).catch(error => {
      console.warn(`Talk: the STUN server could not start on UDP port ${hub.config.stunPort}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
