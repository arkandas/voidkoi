import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ANSWER_BURST,
  ANSWERS_PER_SECOND,
  AnswerLimiter,
  BINDING_REQUEST,
  buildBindingResponse,
  BINDING_SUCCESS_RESPONSE,
  MAGIC_COOKIE,
  buildStunMessage,
  normalizeAddress,
  parseStunMessage,
  readXorMappedAddress,
  sourceOf,
  startStunServer,
  type StunServer,
} from './stun';

let server: StunServer;

beforeAll(async () => {
  server = await startStunServer({ port: 0, host: '127.0.0.1', ipv6: false, log: () => {} });
});

afterAll(async () => {
  await server.close();
});

/** Send one datagram and resolve with the reply, or `null` after `waitMs`. */
function exchange(
  socket: dgram.Socket,
  packet: Buffer,
  port: number,
  waitMs = 400,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.removeListener('message', onMessage);
      resolve(null);
    }, waitMs);
    const onMessage = (reply: Buffer): void => {
      clearTimeout(timer);
      socket.removeListener('message', onMessage);
      resolve(reply);
    };
    socket.on('message', onMessage);
    socket.send(packet, port, '127.0.0.1');
  });
}

function openClient(): Promise<dgram.Socket> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.bind(0, '127.0.0.1', () => resolve(socket));
  });
}

describe('binding requests', () => {
  it('reports the sender its own address and port', async () => {
    const socket = await openClient();
    const transactionId = randomBytes(12);
    const request = buildStunMessage(BINDING_REQUEST, transactionId, []);

    const reply = await exchange(socket, request, server.port);
    expect(reply).not.toBeNull();

    const message = parseStunMessage(reply!);
    expect(message).not.toBeNull();
    expect(message!.type).toBe(BINDING_SUCCESS_RESPONSE);
    // The transaction id must come back untouched so the client can match it.
    expect(Buffer.compare(message!.transactionId, transactionId)).toBe(0);

    const mapped = readXorMappedAddress(message!);
    expect(mapped).not.toBeNull();
    expect(mapped!.family).toBe('ipv4');
    expect(mapped!.address).toBe('127.0.0.1');
    expect(mapped!.port).toBe(socket.address().port);

    socket.close();
  });

  it('gives every request its own transaction id back', async () => {
    const socket = await openClient();
    for (let i = 0; i < 3; i += 1) {
      const transactionId = randomBytes(12);
      const reply = await exchange(socket, buildStunMessage(BINDING_REQUEST, transactionId, []), server.port);
      const message = parseStunMessage(reply!);
      expect(Buffer.compare(message!.transactionId, transactionId)).toBe(0);
    }
    socket.close();
  });

  it('answers with the mapped address and nothing else, barely bigger than the request', async () => {
    const socket = await openClient();
    const request = buildStunMessage(BINDING_REQUEST, randomBytes(12), []);
    const reply = await exchange(socket, request, server.port);
    // The header and one attribute: its own header and eight bytes of address.
    expect(reply).toHaveLength(request.length + 12);
    expect(parseStunMessage(reply!)!.attributes.readUInt16BE(0)).toBe(0x0020);
    expect(buildBindingResponse(randomBytes(12), '2001:db8::1', 51234)).toHaveLength(request.length + 24);
    socket.close();
  });

  it('XORs the address, so the raw bytes are not the address', async () => {
    const socket = await openClient();
    const transactionId = randomBytes(12);
    const reply = await exchange(socket, buildStunMessage(BINDING_REQUEST, transactionId, []), server.port);
    // 127.0.0.1 XOR magic cookie = 0x2112a442 ^ 0x7f000001 = 0x5e12a443
    const attributes = parseStunMessage(reply!)!.attributes;
    // First attribute is XOR-MAPPED-ADDRESS: 4 byte TLV header + 4 byte prefix.
    const rawAddress = attributes.readUInt32BE(8);
    expect(rawAddress).toBe((0x7f000001 ^ MAGIC_COOKIE) >>> 0);
    socket.close();
  });
});

describe('malformed and unrelated packets', () => {
  const cases: Array<[string, Buffer]> = [
    ['empty datagram', Buffer.alloc(0)],
    ['too short for a header', Buffer.alloc(12)],
    ['wrong magic cookie', (() => {
      const packet = buildStunMessage(BINDING_REQUEST, randomBytes(12), []);
      packet.writeUInt32BE(0xdeadbeef, 4);
      return packet;
    })()],
    ['high bits set (not STUN)', (() => {
      const packet = buildStunMessage(BINDING_REQUEST, randomBytes(12), []);
      packet[0] = 0xff;
      return packet;
    })()],
    ['unsupported method', buildStunMessage(0x0002, randomBytes(12), [])],
    ['attribute length past the end', (() => {
      const packet = buildStunMessage(BINDING_REQUEST, randomBytes(12), []);
      packet.writeUInt16BE(64, 2);
      return packet;
    })()],
    ['attribute length not 4-byte aligned', (() => {
      const packet = Buffer.concat([buildStunMessage(BINDING_REQUEST, randomBytes(12), []), Buffer.alloc(8)]);
      packet.writeUInt16BE(3, 2);
      return packet;
    })()],
    ['random noise', randomBytes(64)],
  ];

  it.each(cases)('ignores %s without replying', async (_label, packet) => {
    const socket = await openClient();
    const reply = await exchange(socket, packet, server.port, 250);
    expect(reply).toBeNull();
    socket.close();
  });

  it('is still alive after all of that', async () => {
    const socket = await openClient();
    const transactionId = randomBytes(12);
    const reply = await exchange(socket, buildStunMessage(BINDING_REQUEST, transactionId, []), server.port);
    expect(reply).not.toBeNull();
    expect(readXorMappedAddress(parseStunMessage(reply!)!)!.port).toBe(socket.address().port);
    socket.close();
  });
});

describe('answers to one source', () => {
  it('stop past the limit, whatever port they come from', async () => {
    const limited = await startStunServer({ port: 0, host: '127.0.0.1', ipv6: false, log: () => {}, answers: { burst: 3, perSecond: 0.01 } });
    try {
      const [first, second] = [await openClient(), await openClient()];
      const replies: Array<Buffer | null> = [];
      for (let i = 0; i < 4; i += 1) replies.push(await exchange(first, buildStunMessage(BINDING_REQUEST, randomBytes(12), []), limited.port, 250));
      expect(replies.map(reply => reply !== null)).toEqual([true, true, true, false]);
      expect(await exchange(second, buildStunMessage(BINDING_REQUEST, randomBytes(12), []), limited.port, 250)).toBeNull();
      first.close();
      second.close();
    } finally {
      await limited.close();
    }
  });

  it('come back with time, a bucket for each address or IPv6 /64', () => {
    let now = 0;
    const limiter = new AnswerLimiter(2, 1, () => now);
    expect(['203.0.113.7', '203.0.113.7', '203.0.113.7'].map(address => limiter.allow(address))).toEqual([true, true, false]);
    // Another address has its own; the same one written as IPv6 does not.
    expect(limiter.allow('203.0.113.8')).toBe(true);
    expect(limiter.allow('::ffff:203.0.113.7')).toBe(false);
    now = 1000;
    expect(limiter.allow('203.0.113.7')).toBe(true);
    expect(limiter.allow('203.0.113.7')).toBe(false);

    // A forger changing the low bits of an IPv6 address stays in one bucket.
    expect(['2001:db8::1', '2001:db8::2', '2001:db8:0:0:ffff::9'].map(address => limiter.allow(address))).toEqual([true, true, false]);
    expect(limiter.allow('2001:db8:0:1::1')).toBe(true);
    expect(sourceOf('2001:db8::1')).toBe(sourceOf('2001:0db8:0000:0000:1234::'));
  });

  it('forget the oldest source rather than grow without end', () => {
    const limiter = new AnswerLimiter(1, 0, () => 0, 2);
    expect(limiter.allow('192.0.2.1')).toBe(true);
    expect(limiter.allow('192.0.2.1')).toBe(false);
    limiter.allow('192.0.2.2');
    limiter.allow('192.0.2.3');
    // 192.0.2.1 was forgotten to make room, so it starts afresh.
    expect(limiter.allow('192.0.2.1')).toBe(true);
  });

  it('are a burst and then a few a second unless set', () => {
    let now = 0;
    const limiter = new AnswerLimiter(undefined, undefined, () => now);
    const answered = (count: number) => Array.from({ length: count }, () => limiter.allow('198.51.100.1')).filter(Boolean).length;
    expect(answered(ANSWER_BURST + 5)).toBe(ANSWER_BURST);
    now = 1000;
    expect(answered(ANSWERS_PER_SECOND + 5)).toBe(ANSWERS_PER_SECOND);
  });
});

describe('parsing helpers', () => {
  it('rejects packets shorter than the 20 byte header', () => {
    expect(parseStunMessage(Buffer.alloc(19))).toBeNull();
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(normalizeAddress('::ffff:192.168.1.7')).toBe('192.168.1.7');
    expect(normalizeAddress('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeAddress('10.0.0.1')).toBe('10.0.0.1');
  });

  it('round-trips an IPv6 mapped address', () => {
    const transactionId = randomBytes(12);
    // Build a response as if the peer were IPv6, then read it back.
    const response = buildBindingResponse(transactionId, '2001:db8::1', 51234);
    expect(response).not.toBeNull();
    const mapped = readXorMappedAddress(parseStunMessage(response!)!);
    expect(mapped).toEqual({ family: 'ipv6', address: '2001:db8:0:0:0:0:0:1', port: 51234 });
  });
});
