/**
 * A typed WebSocket client for the socket tests. Frames are kept as they
 * arrive, so `waitFor` also matches one that landed before the test asked.
 */
import WebSocket from 'ws';

import type { ClientMessage, ServerMessageType, ServerToClientMessage } from '@/modules/talk/lib/protocol';

import { SOCKET_PATH } from '../jobs';

type ServerMessageOf<T extends ServerMessageType> = Extract<ServerToClientMessage, { type: T }>;

export interface UpgradeRefusal {
  statusCode: number;
  body: string;
}

export class TestSocket {
  readonly received: ServerToClientMessage[] = [];
  private readonly waiters: Array<{ match: (message: ServerToClientMessage) => boolean; resolve: (message: ServerToClientMessage) => void }> = [];
  closed = false;
  closeCode: number | null = null;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString('utf8')) as ServerToClientMessage;
      this.received.push(message);
      for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
        const waiter = this.waiters[i]!;
        if (waiter.match(message)) {
          this.waiters.splice(i, 1);
          waiter.resolve(message);
        }
      }
    });
    socket.on('close', (code: number) => {
      this.closed = true;
      this.closeCode = code;
    });
  }

  static url(baseUrl: string): string {
    return `${baseUrl.replace(/^http/, 'ws')}${SOCKET_PATH}`;
  }

  static connect(baseUrl: string, cookie: string, headers: Record<string, string> = {}): Promise<TestSocket> {
    const socket = new WebSocket(TestSocket.url(baseUrl), { headers: { cookie, ...headers } });
    return new Promise((resolve, reject) => {
      const client = new TestSocket(socket);
      socket.once('open', () => resolve(client));
      socket.once('error', (error: Error) => reject(error));
      socket.once('unexpected-response', (_request, response) => reject(new Error(`upgrade refused with ${response.statusCode}`)));
    });
  }

  /** An upgrade expected to be refused, and the HTTP answer it got. */
  static connectExpectingRefusal(baseUrl: string, headers: Record<string, string> = {}): Promise<UpgradeRefusal> {
    const socket = new WebSocket(TestSocket.url(baseUrl), { headers });
    return new Promise((resolve, reject) => {
      socket.once('open', () => {
        socket.close();
        reject(new Error('upgrade unexpectedly succeeded'));
      });
      socket.once('unexpected-response', (_request, response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      });
      socket.once('error', (error: Error) => reject(error));
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** A raw string, for the malformed-input tests. */
  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  /** The next, or an already kept, message of this type. */
  waitFor<T extends ServerMessageType>(type: T, timeoutMs = 5000): Promise<ServerMessageOf<T>> {
    return this.waitWhere(message => message.type === type, timeoutMs, type) as Promise<ServerMessageOf<T>>;
  }

  waitWhere(match: (message: ServerToClientMessage) => boolean, timeoutMs = 5000, label = 'predicate'): Promise<ServerToClientMessage> {
    const kept = this.received.find(match);
    if (kept) return Promise.resolve(kept);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex(waiter => waiter.resolve === wrapped);
        if (index !== -1) this.waiters.splice(index, 1);
        reject(new Error(`timed out waiting for ${label}; received: ${this.received.map(m => m.type).join(', ')}`));
      }, timeoutMs);
      const wrapped = (message: ServerToClientMessage): void => {
        clearTimeout(timer);
        resolve(message);
      };
      this.waiters.push({ match, resolve: wrapped });
    });
  }

  /** Every kept message of a type, for checking one did not arrive. */
  all<T extends ServerMessageType>(type: T): Array<ServerMessageOf<T>> {
    return this.received.filter(m => m.type === type) as Array<ServerMessageOf<T>>;
  }

  waitForClose(timeoutMs = 5000): Promise<number> {
    if (this.closed) return Promise.resolve(this.closeCode ?? 0);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
      this.socket.once('close', (code: number) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
