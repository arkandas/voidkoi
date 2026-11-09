/**
 * Who has Talk open, kept in memory. One socket per account: opening a second
 * replaces the first, which is told `replaced` so it stops reconnecting.
 *
 * Never stored: after a restart everyone is offline until their browser
 * reconnects, which is the truth.
 */
import type { PresenceUser, ServerToClientMessage, UserStatus } from '@/modules/talk/lib/protocol';

import { toDirectoryUser, type UserRow } from '../users';

/** The part of a WebSocket this needs, which keeps the tests free of `ws`. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
}

const OPEN = 1;

/**
 * How long a visible page may stay quiet before it stops counting as looked
 * at. Its client says something well inside this while it is on screen; a
 * phone that froze the page without saying so goes quiet instead.
 */
export const WATCHING_WINDOW_MS = 60_000;

export interface Connection {
  readonly userId: number;
  readonly socket: SocketLike;
  /** What the page last said about being on screen. */
  visible: boolean;
  /** When anything last arrived from it, in epoch milliseconds. */
  lastSeenAt: number;
  send(message: ServerToClientMessage): void;
}

export function createConnection(userId: number, socket: SocketLike, now = Date.now()): Connection {
  return {
    userId,
    socket,
    // A page that has just connected is being looked at; it says otherwise in its first frame if not.
    visible: true,
    lastSeenAt: now,
    send(message: ServerToClientMessage): void {
      if (socket.readyState !== OPEN) return;
      try {
        socket.send(JSON.stringify(message));
      } catch {
        // Died between the check and the write; the close handler cleans up.
      }
    },
  };
}

export class PresenceRegistry {
  private readonly connections = new Map<number, Connection>();
  private readonly inCall = new Set<number>();

  /** Register a socket, putting aside any earlier one of the same account, which it returns. */
  add(connection: Connection): Connection | null {
    const previous = this.connections.get(connection.userId) ?? null;
    this.connections.set(connection.userId, connection);
    return previous;
  }

  /** Only the socket registered now can remove itself: a replaced one closing later doesn't knock the new one out. */
  remove(connection: Connection): boolean {
    if (this.connections.get(connection.userId) !== connection) return false;
    this.connections.delete(connection.userId);
    this.inCall.delete(connection.userId);
    return true;
  }

  get(userId: number): Connection | undefined {
    return this.connections.get(userId);
  }

  isOnline(userId: number): boolean {
    return this.connections.has(userId);
  }

  /** Whether somebody is looking at Talk now: connected, on screen, and heard from lately. Otherwise it's worth a notification. */
  isWatching(userId: number, now = Date.now()): boolean {
    const connection = this.connections.get(userId);
    return connection !== undefined && connection.visible && now - connection.lastSeenAt <= WATCHING_WINDOW_MS;
  }

  statusOf(userId: number): UserStatus {
    if (!this.connections.has(userId)) return 'offline';
    return this.inCall.has(userId) ? 'in-call' : 'online';
  }

  setInCall(userId: number, value: boolean): void {
    if (value) this.inCall.add(userId);
    else this.inCall.delete(userId);
  }

  /** Everyone who uses Talk, with whether they have it open. */
  snapshot(directory: readonly UserRow[]): PresenceUser[] {
    return directory.map(user => toDirectoryUser(user, this.statusOf(user.id)));
  }

  sendTo(userId: number, message: ServerToClientMessage): boolean {
    const connection = this.connections.get(userId);
    if (!connection) return false;
    connection.send(message);
    return true;
  }

  broadcast(message: ServerToClientMessage): void {
    for (const connection of this.connections.values()) connection.send(message);
  }

  /** Close every socket, as the process stops. */
  closeAll(code = 1001, reason = 'going away'): void {
    for (const connection of this.connections.values()) {
      try {
        connection.socket.close(code, reason);
      } catch {
        // Already gone.
      }
    }
    this.connections.clear();
    this.inCall.clear();
  }
}
