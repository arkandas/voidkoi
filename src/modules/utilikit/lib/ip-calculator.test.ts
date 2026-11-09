import { describe, expect, it } from 'vitest';
import { calculateSubnet, parseCidr, parseIPv4, parsePrefix } from '@/modules/utilikit/lib/ip-calculator';

function subnet(ip: string, prefix: number) {
  const result = calculateSubnet(ip, prefix);
  if (!result) throw new Error(`${ip}/${prefix} should be valid`);
  return result;
}

const typeOf = (ip: string) => subnet(ip, 32).addressType;

describe('calculateSubnet', () => {
  it('describes 192.168.1.10/24', () => {
    expect(subnet('192.168.1.10', 24)).toEqual({
      ipAddress: '192.168.1.10',
      prefix: 24,
      networkAddress: '192.168.1.0',
      broadcastAddress: '192.168.1.255',
      subnetMask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
      firstHost: '192.168.1.1',
      lastHost: '192.168.1.254',
      totalAddresses: 256,
      usableHosts: 254,
      ipClass: 'C',
      addressType: 'private',
      ipBinary: '11000000.10101000.00000001.00001010',
      maskBinary: '11111111.11111111.11111111.00000000',
      networkBinary: '11000000.10101000.00000001.00000000',
    });
  });

  it('leaves two usable hosts in a /30', () => {
    expect(subnet('10.0.0.5', 30)).toMatchObject({
      networkAddress: '10.0.0.4',
      broadcastAddress: '10.0.0.7',
      subnetMask: '255.255.255.252',
      wildcardMask: '0.0.0.3',
      firstHost: '10.0.0.5',
      lastHost: '10.0.0.6',
      totalAddresses: 4,
      usableHosts: 2,
    });
  });

  it('uses both addresses of a /31 as hosts and has no broadcast (RFC 3021)', () => {
    expect(subnet('10.0.0.1', 31)).toMatchObject({
      networkAddress: '10.0.0.0',
      broadcastAddress: null,
      subnetMask: '255.255.255.254',
      wildcardMask: '0.0.0.1',
      firstHost: '10.0.0.0',
      lastHost: '10.0.0.1',
      totalAddresses: 2,
      usableHosts: 2,
    });
  });

  it('describes a single address for /32', () => {
    expect(subnet('8.8.8.8', 32)).toMatchObject({
      networkAddress: '8.8.8.8',
      broadcastAddress: null,
      subnetMask: '255.255.255.255',
      wildcardMask: '0.0.0.0',
      firstHost: '8.8.8.8',
      lastHost: '8.8.8.8',
      totalAddresses: 1,
      usableHosts: 1,
    });
  });

  it('covers the whole IPv4 space for /0', () => {
    expect(subnet('203.0.113.9', 0)).toMatchObject({
      networkAddress: '0.0.0.0',
      broadcastAddress: '255.255.255.255',
      subnetMask: '0.0.0.0',
      wildcardMask: '255.255.255.255',
      firstHost: '0.0.0.1',
      lastHost: '255.255.255.254',
      totalAddresses: 4_294_967_296,
      usableHosts: 4_294_967_294,
      maskBinary: '00000000.00000000.00000000.00000000',
      networkBinary: '00000000.00000000.00000000.00000000',
    });
  });

  it('describes a /8', () => {
    expect(subnet('10.20.30.40', 8)).toMatchObject({
      networkAddress: '10.0.0.0',
      broadcastAddress: '10.255.255.255',
      subnetMask: '255.0.0.0',
      wildcardMask: '0.255.255.255',
      firstHost: '10.0.0.1',
      lastHost: '10.255.255.254',
      totalAddresses: 16_777_216,
      usableHosts: 16_777_214,
      ipClass: 'A',
    });
  });

  it('handles prefixes that do not fall on an octet boundary', () => {
    expect(subnet('172.16.5.4', 20)).toMatchObject({
      networkAddress: '172.16.0.0',
      broadcastAddress: '172.16.15.255',
      subnetMask: '255.255.240.0',
      wildcardMask: '0.0.15.255',
      usableHosts: 4094,
    });
  });

  it('builds a contiguous mask and a complementary wildcard for every prefix', () => {
    for (let prefix = 0; prefix <= 32; prefix++) {
      const result = subnet('255.255.255.255', prefix);
      const ones = '1'.repeat(prefix) + '0'.repeat(32 - prefix);
      expect(result.maskBinary.replace(/\./g, '')).toBe(ones);
      expect(result.networkBinary).toBe(result.maskBinary);

      const mask = result.subnetMask.split('.').map(Number);
      const wildcard = result.wildcardMask.split('.').map(Number);
      expect(mask.map((octet, index) => octet + wildcard[index])).toEqual([255, 255, 255, 255]);
    }
  });

  it('renders every octet as eight binary digits', () => {
    expect(subnet('1.2.3.4', 32).ipBinary).toBe('00000001.00000010.00000011.00000100');
    expect(subnet('255.0.128.7', 32).ipBinary).toBe('11111111.00000000.10000000.00000111');
  });

  it('rejects invalid addresses and prefixes', () => {
    expect(calculateSubnet('192.168.1.256', 24)).toBeNull();
    expect(calculateSubnet('192.168.1', 24)).toBeNull();
    expect(calculateSubnet('', 24)).toBeNull();
    expect(calculateSubnet('192.168.1.1', 33)).toBeNull();
    expect(calculateSubnet('192.168.1.1', -1)).toBeNull();
    expect(calculateSubnet('192.168.1.1', 24.5)).toBeNull();
  });
});

describe('address type', () => {
  it('recognises the RFC 1918 private ranges up to their edges', () => {
    for (const ip of ['10.0.0.0', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255']) {
      expect(typeOf(ip)).toBe('private');
    }
    for (const ip of ['9.255.255.255', '11.0.0.0', '172.15.255.255', '172.32.0.0', '192.167.255.255', '192.169.0.0']) {
      expect(typeOf(ip)).toBe('public');
    }
  });

  it('recognises loopback, link-local and other special-purpose ranges', () => {
    expect(typeOf('127.0.0.1')).toBe('loopback');
    expect(typeOf('127.255.255.254')).toBe('loopback');
    expect(typeOf('169.254.10.20')).toBe('linkLocal');
    expect(typeOf('169.255.0.1')).toBe('public');
    expect(typeOf('100.64.0.1')).toBe('shared');
    expect(typeOf('224.0.0.251')).toBe('multicast');
    expect(typeOf('192.0.2.1')).toBe('documentation');
    expect(typeOf('198.51.100.7')).toBe('documentation');
    expect(typeOf('0.0.0.0')).toBe('reserved');
    expect(typeOf('255.255.255.255')).toBe('reserved');
    expect(typeOf('8.8.8.8')).toBe('public');
  });

  it('classifies the address itself rather than its network', () => {
    expect(subnet('192.168.1.10', 8).addressType).toBe('private');
    expect(subnet('10.0.0.1', 0).addressType).toBe('private');
  });
});

describe('ipClass', () => {
  it('follows the first octet boundaries of classful addressing', () => {
    const boundaries = ['0.0.0.0', '127.255.255.255', '128.0.0.0', '191.255.255.255', '192.0.0.0', '223.255.255.255'];
    const upper = ['224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255'];
    expect([...boundaries, ...upper].map(ip => subnet(ip, 32).ipClass)).toEqual([
      'A',
      'A',
      'B',
      'B',
      'C',
      'C',
      'D',
      'D',
      'E',
      'E',
    ]);
  });
});

describe('parseIPv4', () => {
  it('converts dotted quads to unsigned 32-bit integers', () => {
    expect(parseIPv4('0.0.0.0')).toBe(0);
    expect(parseIPv4('255.255.255.255')).toBe(0xffffffff);
    expect(parseIPv4('192.168.1.1')).toBe(0xc0a80101);
    expect(parseIPv4(' 10.0.0.1 ')).toBe(0x0a000001);
  });

  it('rejects malformed addresses and out-of-range octets', () => {
    const invalid = [
      '',
      '1.2.3',
      '1.2.3.4.5',
      '1..2.3',
      '256.0.0.1',
      '1.2.3.1000',
      '01.2.3.4',
      '1.2.3.-4',
      'a.b.c.d',
      '0x1.2.3.4',
      '1e2.0.0.1',
      '1 .2.3.4',
      '1.2.3.4/24',
    ];
    for (const value of invalid) expect(parseIPv4(value)).toBeNull();
  });
});

describe('parsePrefix', () => {
  it('accepts 0 to 32, with or without a leading slash', () => {
    expect(parsePrefix('0')).toBe(0);
    expect(parsePrefix('24')).toBe(24);
    expect(parsePrefix('/24')).toBe(24);
    expect(parsePrefix(' 32 ')).toBe(32);
  });

  it('rejects out-of-range and malformed prefixes', () => {
    for (const value of ['', '33', '-1', '100', '2.5', 'abc', '//24']) expect(parsePrefix(value)).toBeNull();
  });
});

describe('parseCidr', () => {
  it('splits CIDR notation into an address and a prefix', () => {
    expect(parseCidr('192.168.1.0/24')).toEqual({ ip: '192.168.1.0', prefix: 24 });
    expect(parseCidr(' 10.0.0.1 / 8 ')).toEqual({ ip: '10.0.0.1', prefix: 8 });
  });

  it('rejects incomplete or invalid notation', () => {
    for (const value of ['', '10.0.0.1', '10.0.0.1/', '/24', '10.0.0.1/33', '300.0.0.1/8', '10.0.0.1/8/8']) {
      expect(parseCidr(value)).toBeNull();
    }
  });

  it('produces a network that maps back onto itself', () => {
    const parsed = parseCidr('172.16.5.4/20');
    if (!parsed) throw new Error('172.16.5.4/20 should parse');
    const { networkAddress, broadcastAddress } = subnet(parsed.ip, parsed.prefix);
    expect(subnet(networkAddress, parsed.prefix)).toMatchObject({ networkAddress, broadcastAddress });
  });
});
