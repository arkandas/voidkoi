export type IpClass = 'A' | 'B' | 'C' | 'D' | 'E';

export type AddressType =
  | 'public'
  | 'private'
  | 'loopback'
  | 'linkLocal'
  | 'shared'
  | 'multicast'
  | 'documentation'
  | 'reserved';

export interface SubnetInfo {
  ipAddress: string;
  prefix: number;
  networkAddress: string;
  broadcastAddress: string | null;
  subnetMask: string;
  wildcardMask: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
  ipClass: IpClass;
  addressType: AddressType;
  ipBinary: string;
  maskBinary: string;
  networkBinary: string;
}

const OCTET = /^(?:0|[1-9]\d{0,2})$/;
const PREFIX = /^\/?(\d{1,2})$/;

const SPECIAL_RANGES: ReadonlyArray<readonly [network: string, prefix: number, type: AddressType]> = [
  ['0.0.0.0', 8, 'reserved'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'shared'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'linkLocal'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'reserved'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'reserved'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

export function parseIPv4(value: string): number | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4 || !parts.every(part => OCTET.test(part) && Number(part) <= 255)) return null;
  return parts.reduce((address, part) => address * 256 + Number(part), 0);
}

export function parsePrefix(value: string): number | null {
  const match = value.trim().match(PREFIX);
  if (!match) return null;
  const prefix = Number(match[1]);
  return prefix <= 32 ? prefix : null;
}

export function parseCidr(value: string): { ip: string; prefix: number } | null {
  const parts = value.split('/');
  if (parts.length !== 2) return null;

  const address = parseIPv4(parts[0]);
  const prefix = parsePrefix(parts[1]);
  return address === null || prefix === null ? null : { ip: formatIPv4(address), prefix };
}

function octets(address: number): number[] {
  return [24, 16, 8, 0].map(shift => (address >>> shift) & 255);
}

function formatIPv4(address: number): string {
  return octets(address).join('.');
}

function toBinary(address: number): string {
  return octets(address)
    .map(octet => octet.toString(2).padStart(8, '0'))
    .join('.');
}

function networkOf(address: number, prefix: number): number {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) * size;
}

function getIpClass(address: number): IpClass {
  const firstOctet = address >>> 24;
  if (firstOctet < 128) return 'A';
  if (firstOctet < 192) return 'B';
  if (firstOctet < 224) return 'C';
  if (firstOctet < 240) return 'D';
  return 'E';
}

function getAddressType(address: number): AddressType {
  const range = SPECIAL_RANGES.find(([network, prefix]) => parseIPv4(network) === networkOf(address, prefix));
  return range ? range[2] : 'public';
}

export function calculateSubnet(ip: string, prefix: number): SubnetInfo | null {
  const address = parseIPv4(ip);
  if (address === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;

  const size = 2 ** (32 - prefix);
  const network = networkOf(address, prefix);
  const broadcast = network + size - 1;
  const mask = 2 ** 32 - size;
  const allUsable = prefix >= 31;

  return {
    ipAddress: formatIPv4(address),
    prefix,
    networkAddress: formatIPv4(network),
    broadcastAddress: allUsable ? null : formatIPv4(broadcast),
    subnetMask: formatIPv4(mask),
    wildcardMask: formatIPv4(size - 1),
    firstHost: formatIPv4(allUsable ? network : network + 1),
    lastHost: formatIPv4(allUsable ? broadcast : broadcast - 1),
    totalAddresses: size,
    usableHosts: allUsable ? size : size - 2,
    ipClass: getIpClass(address),
    addressType: getAddressType(address),
    ipBinary: toBinary(address),
    maskBinary: toBinary(mask),
    networkBinary: toBinary(network),
  };
}
