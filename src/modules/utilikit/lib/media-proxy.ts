import { randomBytes, timingSafeEqual } from 'crypto'
import http, { type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'http'
import net, { isIP, type AddressInfo } from 'net'
import type { Duplex } from 'stream'
import { BlockedAddressError, guardedLookup, isPrivateAddress, type AddressFilter } from '@/modules/utilikit/lib/safe-fetch'

/**
 * The way out for yt-dlp: an HTTP proxy on 127.0.0.1 that reaches public
 * addresses and nothing else. Checking a link before yt-dlp runs isn't
 * enough, since yt-dlp looks the name up again and it can point somewhere
 * else by then. The proxy looks each name up as it connects, refuses private
 * addresses, and connects to the address it checked.
 */

const USER = 'utilikit'
const PORTS = [80, 443]
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']

export interface ProxyOptions {
  /** The addresses it refuses: private ones, unless a test says otherwise. */
  isBlocked?: AddressFilter
  /** The ports it connects to: 80 and 443, unless a test says otherwise. */
  ports?: readonly number[]
}

export interface PublicProxy {
  /** `http://utilikit:<token>@127.0.0.1:<port>`, for yt-dlp's `--proxy`. */
  url: string
  close(): Promise<void>
}

interface Target {
  host: string
  port: number
}

/** A CONNECT request's `host:port`, an IPv6 address in brackets. */
function parseAuthority(value: string): Target | null {
  const match = /^(?:\[([0-9a-f:.]+)\]|([^\s:/@[\]]+)):(\d{1,5})$/i.exec(value)
  if (!match) return null
  const port = Number(match[3])
  return port > 0 && port < 65536 ? { host: match[1] ?? match[2], port } : null
}

/** A connection to a public address of `target`: an IP address is checked as it is, a name as it is looked up. */
function connect({ host, port }: Target, isBlocked: AddressFilter): net.Socket {
  if (isIP(host)) {
    if (isBlocked(host)) throw new BlockedAddressError(host)
    return net.connect({ host, port })
  }
  return net.connect({ host, port, lookup: guardedLookup(isBlocked) })
}

function withoutHopByHop(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const named = String(headers.connection ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
  const kept = { ...headers }
  for (const name of [...HOP_BY_HOP, ...named]) delete kept[name]
  return kept
}

function refuseTunnel(client: Duplex, status: number) {
  const challenge = status === 407 ? `Proxy-Authenticate: Basic realm="${USER}"\r\n` : ''
  client.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n${challenge}Content-Length: 0\r\nConnection: close\r\n\r\n`)
}

function refuseRequest(response: ServerResponse, status: number) {
  const challenge = status === 407 ? { 'Proxy-Authenticate': `Basic realm="${USER}"` } : {}
  response.writeHead(status, { ...challenge, 'Content-Length': '0', Connection: 'close' }).end()
}

export async function startPublicProxy({ isBlocked = isPrivateAddress, ports = PORTS }: ProxyOptions = {}): Promise<PublicProxy> {
  const token = randomBytes(24).toString('hex')
  const expected = Buffer.from(`${USER}:${token}`)

  const authorized = (header: string | undefined) => {
    const [scheme, credentials] = (header ?? '').trim().split(/\s+/)
    if (scheme?.toLowerCase() !== 'basic' || !credentials) return false
    const given = Buffer.from(credentials, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  const server = http.createServer()

  // HTTPS, and anything else yt-dlp tunnels.
  server.on('connect', (request: IncomingMessage, client: Duplex, head: Buffer) => {
    client.on('error', () => client.destroy())
    if (!authorized(request.headers['proxy-authorization'])) return refuseTunnel(client, 407)
    const target = parseAuthority(request.url ?? '')
    if (!target) return refuseTunnel(client, 400)
    if (!ports.includes(target.port)) return refuseTunnel(client, 403)

    let upstream: net.Socket
    try {
      upstream = connect(target, isBlocked)
    } catch {
      return refuseTunnel(client, 403)
    }
    client.on('close', () => upstream.destroy())
    upstream.once('error', error => refuseTunnel(client, error instanceof BlockedAddressError ? 403 : 502))
    upstream.once('connect', () => {
      upstream.removeAllListeners('error')
      upstream.on('error', () => client.destroy())
      upstream.on('close', () => client.destroy())
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
  })

  // Plain HTTP, sent to the proxy with the whole URL.
  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    if (!authorized(request.headers['proxy-authorization'])) return refuseRequest(response, 407)
    let url: URL
    try {
      url = new URL(request.url ?? '')
    } catch {
      return refuseRequest(response, 400)
    }
    if (url.protocol !== 'http:') return refuseRequest(response, 400)
    const target = { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) }
    if (!ports.includes(target.port)) return refuseRequest(response, 403)
    if (isIP(target.host) && isBlocked(target.host)) return refuseRequest(response, 403)

    const upstream = http.request({
      host: target.host,
      port: target.port,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: { ...withoutHopByHop(request.headers), host: url.host },
      lookup: guardedLookup(isBlocked),
      agent: false,
    })
    upstream.on('response', reply => {
      response.writeHead(reply.statusCode ?? 502, reply.statusMessage, withoutHopByHop(reply.headers))
      reply.pipe(response)
    })
    upstream.on('error', error => {
      if (response.headersSent) response.destroy()
      else refuseRequest(response, error instanceof BlockedAddressError ? 403 : 502)
    })
    response.on('close', () => upstream.destroy())
    request.pipe(upstream)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  server.unref()

  const { port } = server.address() as AddressInfo
  return {
    url: `http://${USER}:${token}@127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

const globalForProxy = globalThis as unknown as { utilikitMediaProxy?: Promise<PublicProxy> }

/** The proxy yt-dlp goes through: started on first use, once per process. */
export function mediaProxy(): Promise<PublicProxy> {
  globalForProxy.utilikitMediaProxy ??= startPublicProxy().catch(error => {
    globalForProxy.utilikitMediaProxy = undefined
    throw error
  })
  return globalForProxy.utilikitMediaProxy
}
