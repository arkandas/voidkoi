import { X509Certificate } from 'crypto'
import { isIP } from 'net'
import tls, { type PeerCertificate } from 'tls'
import { ToolError } from '@/modules/utilikit/lib/tool-error'
import { BlockedAddressError, guardedLookup, isPrivateAddress } from '@/modules/utilikit/lib/safe-fetch'

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
const MAX_CERTIFICATES = 10
const TIMEOUT_MS = 10_000
const DAY_MS = 24 * 60 * 60 * 1000

const EXTENDED_KEY_USAGES: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'serverAuth',
  '1.3.6.1.5.5.7.3.2': 'clientAuth',
  '1.3.6.1.5.5.7.3.3': 'codeSigning',
  '1.3.6.1.5.5.7.3.4': 'emailProtection',
  '1.3.6.1.5.5.7.3.8': 'timeStamping',
  '1.3.6.1.5.5.7.3.9': 'ocspSigning',
}

export type CertificateStatus = 'valid' | 'expired' | 'notYetValid'

export interface CertificateSummary {
  subject: Array<[string, string]>
  issuer: Array<[string, string]>
  commonName: string
  serialNumber: string
  validFrom: string
  validTo: string
  daysLeft: number
  status: CertificateStatus
  altNames: string[]
  isCA: boolean
  selfSigned: boolean
  keyType: string
  keySize?: number
  curve?: string
  signatureAlgorithm?: string
  extendedKeyUsage: string[]
  fingerprint256: string
  fingerprint1: string
}

export interface ServerCertificates {
  host: string
  port: number
  certificates: CertificateSummary[]
  trusted: boolean
  trustError?: string
  hostnameMatches: boolean
  protocol?: string
  cipher?: string
}

export function parseDistinguishedName(value: string): Array<[string, string]> {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const equals = line.indexOf('=')
      return equals > 0 ? [line.slice(0, equals), line.slice(equals + 1)] : ['', line]
    })
}

function keyDescription(certificate: X509Certificate) {
  const key = certificate.publicKey
  const details = key.asymmetricKeyDetails ?? {}
  const type = key.asymmetricKeyType ?? 'unknown'
  return {
    keyType: type === 'rsa-pss' ? 'RSA-PSS' : type.length <= 3 ? type.toUpperCase() : type[0].toUpperCase() + type.slice(1),
    keySize: details.modulusLength,
    curve: details.namedCurve,
  }
}

function isSelfSigned(certificate: X509Certificate): boolean {
  try {
    return certificate.checkIssued(certificate) && certificate.verify(certificate.publicKey)
  } catch {
    return false
  }
}

export function summarize(certificate: X509Certificate, now = new Date()): CertificateSummary {
  const from = certificate.validFromDate
  const to = certificate.validToDate
  const subject = parseDistinguishedName(certificate.subject)
  const status: CertificateStatus = now < from ? 'notYetValid' : now > to ? 'expired' : 'valid'

  return {
    subject,
    issuer: parseDistinguishedName(certificate.issuer),
    commonName: subject.find(([key]) => key === 'CN')?.[1] ?? subject.map(([, value]) => value).join(', '),
    serialNumber: certificate.serialNumber.replace(/(..)(?!$)/g, '$1:'),
    validFrom: from.toISOString(),
    validTo: to.toISOString(),
    daysLeft: Math.floor((to.getTime() - now.getTime()) / DAY_MS),
    status,
    altNames: (certificate.subjectAltName ?? '')
      .split(', ')
      .filter(Boolean)
      .map(name => name.replace(/^DNS:/, '').replace(/^IP Address:/, '')),
    isCA: certificate.ca,
    selfSigned: isSelfSigned(certificate),
    ...keyDescription(certificate),
    signatureAlgorithm: certificate.signatureAlgorithm,
    extendedKeyUsage: (certificate.keyUsage ?? []).map(oid => EXTENDED_KEY_USAGES[oid] ?? oid),
    fingerprint256: certificate.fingerprint256,
    fingerprint1: certificate.fingerprint,
  }
}

export function parsePem(text: string): X509Certificate[] {
  const blocks = text.match(PEM_BLOCK) ?? []
  if (blocks.length === 0) throw new ToolError('certificateInvalid', 'No PEM certificate found')

  return blocks.slice(0, MAX_CERTIFICATES).map(block => {
    try {
      return new X509Certificate(block)
    } catch (error) {
      throw new ToolError('certificateInvalid', error instanceof Error ? error.message : String(error))
    }
  })
}

export function parseServer(input: unknown, portInput: unknown): { host: string; port: number } | null {
  if (typeof input !== 'string' || !input.trim()) return null
  let value = input.trim()
  let port = typeof portInput === 'number' ? portInput : Number.parseInt(String(portInput ?? ''), 10)

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      value = url.hostname
      if (url.port) port = Number(url.port)
    } catch {
      return null
    }
  }

  const withPort = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(value)
  if (withPort) {
    value = withPort[1]
    port = Number(withPort[2])
  }

  const host = value.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!Number.isInteger(port)) port = 443
  if (port < 1 || port > 65535) return null
  if (!isIP(host) && !/^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z0-9-]{2,63}$/.test(host)) return null
  return { host, port }
}

function chainOf(peer: PeerCertificate & { issuerCertificate?: PeerCertificate }): X509Certificate[] {
  const chain: X509Certificate[] = []
  const seen = new Set<string>()
  let current: (PeerCertificate & { issuerCertificate?: PeerCertificate }) | undefined = peer

  while (current?.raw && !seen.has(current.fingerprint256) && chain.length < MAX_CERTIFICATES) {
    seen.add(current.fingerprint256)
    chain.push(new X509Certificate(current.raw))
    current = current.issuerCertificate as typeof current
  }

  return chain
}

export function fetchServerCertificates(host: string, port: number, now = new Date()): Promise<ServerCertificates> {
  if (isIP(host) && isPrivateAddress(host)) return Promise.reject(new ToolError('urlNotAllowed', host))

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: isIP(host) ? undefined : host,
      rejectUnauthorized: false,
      lookup: guardedLookup(isPrivateAddress),
      timeout: TIMEOUT_MS,
      ALPNProtocols: ['h2', 'http/1.1'],
    })

    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate(true)
      if (!peer?.raw) {
        socket.destroy()
        reject(new ToolError('certificateInvalid', 'The server did not send a certificate'))
        return
      }

      const chain = chainOf(peer)
      const identity = isIP(host) ? chain[0]?.checkIP(host) : chain[0]?.checkHost(host)
      resolve({
        host,
        port,
        certificates: chain.map(certificate => summarize(certificate, now)),
        trusted: socket.authorized,
        trustError: socket.authorized ? undefined : String(socket.authorizationError ?? ''),
        hostnameMatches: Boolean(identity),
        protocol: socket.getProtocol() ?? undefined,
        cipher: socket.getCipher()?.name,
      })
      socket.end()
    })

    socket.once('timeout', () => {
      socket.destroy()
      reject(new ToolError('connectionFailed', 'Timed out'))
    })

    socket.once('error', error => {
      socket.destroy()
      if (error instanceof BlockedAddressError) reject(new ToolError('urlNotAllowed', host))
      else reject(new ToolError('connectionFailed', error.message))
    })
  })
}
