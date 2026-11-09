import { lookup as dnsLookup, type LookupAddress } from 'dns'
import http, { type IncomingMessage } from 'http'
import https from 'https'
import { isIP, type LookupFunction } from 'net'
import { ToolError } from '@/modules/utilikit/lib/tool-error'

const MAX_REDIRECTS = 5
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 15_000

export type AddressFilter = (address: string) => boolean

function isPrivateIPv4(address: string): boolean {
  const [a, b, c] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

/** The eight 16-bit groups of an address `isIP` calls IPv6, with a dotted IPv4 ending and a zone allowed. */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase().replace(/%.*$/, '')
  const dotted = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number)
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const parse = (part: string | undefined) => (part ? part.split(':').map(group => parseInt(group, 16)) : [])
  const [head, tail] = text.split('::')
  if (tail === undefined) return parse(head)
  const start = parse(head)
  const end = parse(tail)
  return [...start, ...Array<number>(8 - start.length - end.length).fill(0), ...end]
}

const ipv4Of = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')

function isPrivateIPv6(address: string): boolean {
  const [a, b, c, d, e, f, g, h] = ipv6Groups(address)
  const zero = (...groups: number[]) => groups.every(group => group === 0)

  // ::/96 (unspecified, loopback, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped) carry an IPv4 address at the end.
  if (zero(a, b, c, d, e) && (f === 0 || f === 0xffff)) return isPrivateIPv4(ipv4Of(g, h))
  // NAT64's well-known prefix, 64:ff9b::/96, too.
  if (a === 0x64 && b === 0xff9b && zero(c, d, e, f)) return isPrivateIPv4(ipv4Of(g, h))
  // The local-use NAT64 prefix, 64:ff9b:1::/48, may lead to private addresses, and its IPv4 part can sit at several offsets.
  if (a === 0x64 && b === 0xff9b && c === 1) return true
  // 6to4, 2002::/16: the IPv4 address follows the prefix.
  if (a === 0x2002) return isPrivateIPv4(ipv4Of(b, c))
  // IPv4-translated ::ffff:0:0:0/96, and Teredo 2001::/32, which also carry an IPv4 address: refused outright.
  if (zero(a, b, c, d) && e === 0xffff && f === 0) return true
  if (a === 0x2001 && b === 0) return true

  // Unique local fc00::/7, link-local fe80::/10, the old site-local fec0::/10, multicast ff00::/8.
  return (a & 0xfe00) === 0xfc00 || (a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0 || (a & 0xff00) === 0xff00
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPrivateIPv4(address)
  return version === 6 ? isPrivateIPv6(address) : true
}

export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export class BlockedAddressError extends Error {}

export function guardedLookup(isBlocked: AddressFilter): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) return callback(error, '')
      if (addresses.length === 0 || addresses.some(entry => isBlocked(entry.address))) {
        return callback(new BlockedAddressError(hostname), '')
      }
      if (options.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

function get(url: URL, headers: Record<string, string>, isBlocked: AddressFilter, signal: AbortSignal) {
  const client = url.protocol === 'https:' ? https : http

  return new Promise<IncomingMessage>((resolve, reject) => {
    client
      .get(url, { headers, lookup: guardedLookup(isBlocked), signal }, resolve)
      .on('error', error => {
        if (error instanceof BlockedAddressError) reject(new ToolError('urlNotAllowed', url.hostname))
        else if (signal.aborted) reject(new ToolError('fetchFailed', 'Timed out'))
        else reject(new ToolError('fetchFailed', error.message))
      })
  })
}

function readLimited(response: IncomingMessage, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0

    const finish = () => resolve(new TextDecoder().decode(Buffer.concat(chunks)))

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      received += chunk.length
      if (received >= MAX_BYTES) {
        response.destroy()
        finish()
      }
    })
    response.on('end', finish)
    response.on('error', error => {
      if (received >= MAX_BYTES) return
      reject(new ToolError('fetchFailed', signal.aborted ? 'Timed out' : error.message))
    })
  })
}

export async function fetchPublicText(
  start: URL,
  headers: Record<string, string>,
  isBlocked: AddressFilter = isPrivateAddress,
): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const requestHeaders = { ...headers, 'Accept-Encoding': 'identity' }
  let url = start

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const literal = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(literal) && isBlocked(literal)) throw new ToolError('urlNotAllowed', literal)

    const response = await get(url, requestHeaders, isBlocked, signal)
    const status = response.statusCode ?? 0
    const location = response.headers.location

    if (status >= 300 && status < 400 && location) {
      response.resume()
      const next = parseHttpUrl(new URL(location, url).toString())
      if (!next) throw new ToolError('urlNotAllowed', location)
      url = next
      continue
    }

    if (status < 200 || status >= 300) {
      response.resume()
      throw new ToolError('fetchFailed', `${status} ${response.statusMessage ?? ''}`.trim())
    }

    return readLimited(response, signal)
  }

  throw new ToolError('fetchFailed', 'Too many redirects')
}
