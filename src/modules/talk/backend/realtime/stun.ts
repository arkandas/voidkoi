/**
 * A small RFC 5389 STUN server: Binding requests only, no authentication, no
 * TURN, and nothing but `node:dgram` and `node:net`.
 *
 * A WebRTC client sends a Binding Request from the socket it intends to use
 * for media; we reply with the source address and port we observed, XOR-ed as
 * the RFC specifies. That is the whole job: it tells a peer behind NAT what
 * its public address looks like from the outside.
 *
 * UDP's source address can be forged, so an answer could be aimed at someone
 * who never asked. The answer is kept to what the job needs, barely bigger
 * than the request, and each source gets only so many.
 */

import dgram from 'node:dgram';
import { isIPv4 } from 'node:net';

import { TokenBucket } from './token-bucket';

/** All STUN messages carry this cookie at bytes 4..8. */
export const MAGIC_COOKIE = 0x2112a442;

const STUN_HEADER_BYTES = 20;
const TRANSACTION_ID_BYTES = 12;

/** Message types we care about. */
export const BINDING_REQUEST = 0x0001;
export const BINDING_SUCCESS_RESPONSE = 0x0101;

/** Attribute types. */
const ATTR_XOR_MAPPED_ADDRESS = 0x0020;

const FAMILY_IPV4 = 0x01;
const FAMILY_IPV6 = 0x02;

/**
 * Answers to one source at once, and per second after that: plenty for the
 * browsers behind one address setting up calls and keeping them alive, too
 * few to aim at anyone.
 */
export const ANSWER_BURST = 20;
export const ANSWERS_PER_SECOND = 5;

/** Sources remembered at once. Past it the oldest is forgotten, so forged ones can't fill the memory. */
const MAX_SOURCES = 10_000;

export interface StunMessage {
  type: number;
  transactionId: Buffer;
  /** Raw attribute bytes; we never need to look inside for Binding requests. */
  attributes: Buffer;
}

export interface MappedAddress {
  family: 'ipv4' | 'ipv6';
  address: string;
  port: number;
}

/**
 * Parse a datagram into a STUN message, or return `null` when it is not one.
 *
 * Everything here is defensive: this function is fed arbitrary bytes from the
 * open internet and must never throw.
 */
export function parseStunMessage(packet: Buffer): StunMessage | null {
  if (packet.length < STUN_HEADER_BYTES) return null;

  // The two most significant bits of a STUN message must be zero. This is the
  // cheap demultiplexing check the RFC prescribes.
  if ((packet[0]! & 0xc0) !== 0) return null;

  const type = packet.readUInt16BE(0);
  const length = packet.readUInt16BE(2);
  const cookie = packet.readUInt32BE(4);

  if (cookie !== MAGIC_COOKIE) return null;
  // Attribute section is always a multiple of 4 bytes and must fit the packet.
  if (length % 4 !== 0) return null;
  if (STUN_HEADER_BYTES + length > packet.length) return null;

  return {
    type,
    transactionId: packet.subarray(8, 8 + TRANSACTION_ID_BYTES),
    attributes: packet.subarray(STUN_HEADER_BYTES, STUN_HEADER_BYTES + length),
  };
}

/** Encode a dotted-quad or colon-hex address into its network-order bytes. */
function addressToBytes(address: string, family: 'ipv4' | 'ipv6'): Buffer | null {
  if (family === 'ipv4') {
    const parts = address.split('.');
    if (parts.length !== 4) return null;
    const bytes = Buffer.alloc(4);
    for (let i = 0; i < 4; i += 1) {
      const value = Number(parts[i]);
      if (!Number.isInteger(value) || value < 0 || value > 255) return null;
      bytes[i] = value;
    }
    return bytes;
  }
  return ipv6ToBytes(address);
}

function ipv6ToBytes(address: string): Buffer | null {
  // Node hands us canonical addresses, but be forgiving anyway.
  const zoneless = address.split('%')[0] ?? address;
  const [head, tail] = zoneless.split('::') as [string, string | undefined];
  const parseGroups = (chunk: string): number[] | null => {
    if (chunk === '') return [];
    const out: number[] = [];
    for (const group of chunk.split(':')) {
      if (group.includes('.')) {
        // Embedded IPv4 tail, e.g. ::ffff:192.168.1.1
        const v4 = addressToBytes(group, 'ipv4');
        if (!v4) return null;
        out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(Number.parseInt(group, 16));
    }
    return out;
  };

  const headGroups = parseGroups(head ?? '');
  if (!headGroups) return null;
  const tailGroups = tail === undefined ? null : parseGroups(tail);
  if (tail !== undefined && !tailGroups) return null;

  let groups: number[];
  if (tailGroups === null) {
    if (headGroups.length !== 8) return null;
    groups = headGroups;
  } else {
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...headGroups, ...Array<number>(missing).fill(0), ...tailGroups];
  }

  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 8; i += 1) bytes.writeUInt16BE(groups[i]!, i * 2);
  return bytes;
}

function bytesToAddress(bytes: Buffer, family: 'ipv4' | 'ipv6'): string {
  if (family === 'ipv4') return Array.from(bytes).join('.');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i).toString(16));
  return groups.join(':');
}

/**
 * XOR-MAPPED-ADDRESS obfuscates the address so that NATs which rewrite
 * addresses found in payloads leave it alone: the port is XOR-ed with the top
 * 16 bits of the magic cookie, and the address with the cookie (IPv4) or the
 * cookie concatenated with the transaction id (IPv6).
 */
function xorAddressBytes(addressBytes: Buffer, transactionId: Buffer): Buffer {
  const mask = Buffer.alloc(addressBytes.length);
  mask.writeUInt32BE(MAGIC_COOKIE, 0);
  if (addressBytes.length > 4) transactionId.copy(mask, 4, 0, addressBytes.length - 4);
  const out = Buffer.alloc(addressBytes.length);
  for (let i = 0; i < addressBytes.length; i += 1) out[i] = addressBytes[i]! ^ mask[i]!;
  return out;
}

/** Build an XOR-MAPPED-ADDRESS attribute (type, length, value), 4-byte aligned. */
function buildXorMappedAddress(
  address: string,
  port: number,
  transactionId: Buffer,
): Buffer | null {
  const family: 'ipv4' | 'ipv6' = isIPv4(address) ? 'ipv4' : 'ipv6';
  const addressBytes = addressToBytes(address, family);
  if (!addressBytes) return null;

  const value = Buffer.alloc(4 + addressBytes.length);
  value.writeUInt8(0, 0); // reserved, must be zero
  value.writeUInt8(family === 'ipv4' ? FAMILY_IPV4 : FAMILY_IPV6, 1);
  value.writeUInt16BE(port ^ (MAGIC_COOKIE >>> 16), 2);
  xorAddressBytes(addressBytes, transactionId).copy(value, 4);

  return buildAttribute(ATTR_XOR_MAPPED_ADDRESS, value);
}

/** Wrap an attribute value in its TLV header, padded to a 4-byte boundary. */
function buildAttribute(type: number, value: Buffer): Buffer {
  const padding = (4 - (value.length % 4)) % 4;
  const attribute = Buffer.alloc(4 + value.length + padding);
  attribute.writeUInt16BE(type, 0);
  attribute.writeUInt16BE(value.length, 2); // length excludes padding
  value.copy(attribute, 4);
  return attribute;
}

/** Build a complete STUN message from a type, transaction id and attributes. */
export function buildStunMessage(
  type: number,
  transactionId: Buffer,
  attributes: Buffer[],
): Buffer {
  const body = Buffer.concat(attributes);
  const packet = Buffer.alloc(STUN_HEADER_BYTES + body.length);
  packet.writeUInt16BE(type, 0);
  packet.writeUInt16BE(body.length, 2);
  packet.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(packet, 8, 0, TRANSACTION_ID_BYTES);
  body.copy(packet, STUN_HEADER_BYTES);
  return packet;
}

/**
 * Build the Binding Success Response for a request that arrived from
 * `address:port`: the mapped address and nothing else. Returns `null` if the
 * address cannot be encoded.
 */
export function buildBindingResponse(
  transactionId: Buffer,
  address: string,
  port: number,
): Buffer | null {
  const xorMapped = buildXorMappedAddress(normalizeAddress(address), port, transactionId);
  if (!xorMapped) return null;
  return buildStunMessage(BINDING_SUCCESS_RESPONSE, transactionId, [xorMapped]);
}

/**
 * A dual-stack socket reports IPv4 peers as `::ffff:a.b.c.d`. Report those as
 * plain IPv4 so the client sees an address it can actually use.
 */
export function normalizeAddress(address: string): string {
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
  return mapped?.[1] ?? address;
}

/** Read XOR-MAPPED-ADDRESS out of a response. Used by the tests. */
export function readXorMappedAddress(message: StunMessage): MappedAddress | null {
  const { attributes, transactionId } = message;
  let offset = 0;
  while (offset + 4 <= attributes.length) {
    const type = attributes.readUInt16BE(offset);
    const length = attributes.readUInt16BE(offset + 2);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > attributes.length) return null;

    if (type === ATTR_XOR_MAPPED_ADDRESS) {
      const value = attributes.subarray(valueStart, valueEnd);
      if (value.length < 8) return null;
      const familyByte = value.readUInt8(1);
      const family: 'ipv4' | 'ipv6' = familyByte === FAMILY_IPV6 ? 'ipv6' : 'ipv4';
      const expected = family === 'ipv4' ? 8 : 20;
      if (value.length < expected) return null;
      const port = value.readUInt16BE(2) ^ (MAGIC_COOKIE >>> 16);
      const raw = value.subarray(4, expected);
      const addressBytes = xorAddressBytes(raw, transactionId);
      return { family, address: bytesToAddress(addressBytes, family), port };
    }

    offset = valueEnd + ((4 - (length % 4)) % 4);
  }
  return null;
}

/**
 * Where an answer's limit is counted: an IPv4 address, or the /64 an IPv6
 * one is in, the block one network gets, so changing the low bits of a forged
 * source doesn't get round it.
 */
export function sourceOf(address: string): string {
  const plain = normalizeAddress(address);
  if (isIPv4(plain)) return plain;
  const bytes = ipv6ToBytes(plain);
  return bytes ? `${bytes.subarray(0, 8).toString('hex')}/64` : plain;
}

/**
 * How many answers each source may have: a token bucket per source. Over the
 * limit, a request gets no answer at all.
 */
export class AnswerLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly burst = ANSWER_BURST,
    private readonly perSecond = ANSWERS_PER_SECOND,
    private readonly now: () => number = () => performance.now(),
    private readonly maxSources = MAX_SOURCES,
  ) {}

  /** Whether a request from `address` may be answered, counting it if so. */
  allow(address: string): boolean {
    const source = sourceOf(address);
    const now = this.now();
    let bucket = this.buckets.get(source);
    if (!bucket) {
      if (this.buckets.size >= this.maxSources) this.buckets.delete(this.buckets.keys().next().value!);
      bucket = new TokenBucket(this.burst, this.perSecond, now);
      this.buckets.set(source, bucket);
    }
    return bucket.take(now);
  }
}

export interface StunServerOptions {
  port: number;
  /** Bind address for the IPv4 socket. Defaults to every interface. */
  host?: string;
  /** Also listen on IPv6. Defaults to true; disabled automatically if it fails. */
  ipv6?: boolean;
  /** Called for every log line, so tests can stay quiet. */
  log?: (message: string) => void;
  /** Answers per source, at once and per second after; ANSWER_BURST and ANSWERS_PER_SECOND unless set. */
  answers?: { burst: number; perSecond: number };
}

export interface StunServer {
  /** The port actually bound (useful when `port: 0` was requested). */
  port: number;
  /** True when an IPv6 socket is also listening. */
  ipv6: boolean;
  close(): Promise<void>;
}

function handlePacket(socket: dgram.Socket, limiter: AnswerLimiter, packet: Buffer, remote: dgram.RemoteInfo): void {
  const message = parseStunMessage(packet);
  // Not STUN, or not a Binding Request: stay silent. Never reply to garbage.
  if (!message || message.type !== BINDING_REQUEST) return;
  // Asked too often from there: silent too.
  if (!limiter.allow(remote.address)) return;

  const response = buildBindingResponse(message.transactionId, remote.address, remote.port);
  if (!response) return;

  socket.send(response, remote.port, remote.address, () => {
    // Send errors are expected on the open internet (unreachable peers, ICMP
    // port unreachable). Swallow them: a STUN server must not die on one.
  });
}

function bind(socket: dgram.Socket, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    socket.once('error', onError);
    socket.bind(port, host, () => {
      socket.removeListener('error', onError);
      resolve();
    });
  });
}

function closeSocket(socket: dgram.Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.close(() => resolve());
  });
}

/**
 * Start the server. Binds UDP/IPv4 and, when available, UDP/IPv6 on the same
 * port. Resolves once both sockets are listening.
 */
export async function startStunServer(options: StunServerOptions): Promise<StunServer> {
  const log = options.log ?? ((message: string) => console.log(message));
  const wantIpv6 = options.ipv6 !== false;
  // One for both sockets: a source is the same whichever way it comes in.
  const limiter = new AnswerLimiter(options.answers?.burst, options.answers?.perSecond);

  const v4 = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  v4.on('message', (packet, remote) => handlePacket(v4, limiter, packet, remote));
  v4.on('error', (error) => log(`Talk: STUN socket error (UDP over IPv4): ${error.message}`));
  await bind(v4, options.port, options.host);
  const boundPort = v4.address().port;

  let v6: dgram.Socket | null = null;
  if (wantIpv6) {
    // `ipv6Only` keeps this socket from stealing IPv4 traffic from the socket
    // above, which would otherwise fail to bind the same port on some systems.
    const socket = dgram.createSocket({ type: 'udp6', reuseAddr: true, ipv6Only: true });
    socket.on('message', (packet, remote) => handlePacket(socket, limiter, packet, remote));
    socket.on('error', (error) => log(`Talk: STUN socket error (UDP over IPv6): ${error.message}`));
    try {
      await bind(socket, boundPort);
      v6 = socket;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`Talk: STUN over IPv6 is unavailable (${reason}); IPv4 only`);
      await closeSocket(socket).catch(() => undefined);
    }
  }

  log(`Talk: STUN server on UDP port ${boundPort}${v6 ? ' (IPv4 and IPv6)' : ' (IPv4)'}`);

  return {
    port: boundPort,
    ipv6: v6 !== null,
    async close(): Promise<void> {
      await Promise.all([closeSocket(v4), v6 ? closeSocket(v6) : Promise.resolve()]);
    },
  };
}
