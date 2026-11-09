import { Resolver } from 'dns/promises'
import { isIP } from 'net'
import { domainToASCII } from 'url'
import {
  DNS_RESOLVERS,
  RECORD_TYPES,
  type DnsAnswer,
  type DnsQuery,
  type DnsRecord,
  type DnsResolverId,
  type DnsResult,
  type RecordType,
} from '@/modules/utilikit/lib/dns-records'

export { DNS_RESOLVERS, RECORD_TYPES }
export type { DnsAnswer, DnsQuery, DnsRecord, DnsResolverId, DnsResult, RecordType }

export type DnsResolver = Pick<
  Resolver,
  'resolve4' | 'resolve6' | 'resolveCname' | 'resolveMx' | 'resolveNs' | 'resolveTxt' | 'resolveSoa' | 'resolveCaa' | 'resolveSrv' | 'reverse' | 'setServers'
>

const HOSTNAME = /^(?=.{1,253}$)(?:(?!-)[a-z0-9_-]{1,63}(?<!-)\.)*(?!-)[a-z0-9_-]{1,63}(?<!-)$/

export function isResolverId(value: unknown): value is DnsResolverId {
  return typeof value === 'string' && Object.hasOwn(DNS_RESOLVERS, value)
}

export function normalizeQuery(input: unknown): DnsQuery | null {
  if (typeof input !== 'string') return null
  let value = input.trim()
  if (!value) return null

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).hostname
    } catch {
      return null
    }
  }

  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) value = bracketed[1]
  if (isIP(value)) return { kind: 'ip', address: value }

  value = value.replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '')
  if (isIP(value)) return { kind: 'ip', address: value }

  const ascii = domainToASCII(value.toLowerCase())
  return ascii && HOSTNAME.test(ascii) ? { kind: 'domain', name: ascii } : null
}

function caaValue(record: Record<string, unknown>): string {
  const [tag, value] = Object.entries(record).find(([key]) => key !== 'critical') ?? ['', '']
  return `${record.critical ?? 0} ${tag} "${value}"`
}

async function query(resolver: DnsResolver, type: RecordType, name: string): Promise<DnsRecord[]> {
  switch (type) {
    case 'A':
      return (await resolver.resolve4(name, { ttl: true })).map(({ address, ttl }) => ({ value: address, ttl }))
    case 'AAAA':
      return (await resolver.resolve6(name, { ttl: true })).map(({ address, ttl }) => ({ value: address, ttl }))
    case 'CNAME':
      return (await resolver.resolveCname(name)).map(value => ({ value }))
    case 'MX':
      return (await resolver.resolveMx(name))
        .sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange))
        .map(({ exchange, priority }) => ({ value: exchange, priority }))
    case 'NS':
      return (await resolver.resolveNs(name)).sort().map(value => ({ value }))
    case 'TXT':
      return (await resolver.resolveTxt(name)).map(chunks => ({ value: chunks.join('') }))
    case 'SOA': {
      const soa = await resolver.resolveSoa(name)
      return [{ value: `${soa.nsname} ${soa.hostmaster} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minttl}` }]
    }
    case 'CAA':
      return (await resolver.resolveCaa(name)).map(record => ({ value: caaValue(record as unknown as Record<string, unknown>) }))
    case 'SRV':
      return (await resolver.resolveSrv(name))
        .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
        .map(({ name: target, port, priority, weight }) => ({ value: `${weight} ${port} ${target}`, priority }))
    case 'PTR':
      return (await resolver.reverse(name)).map(value => ({ value }))
  }
}

const errorCode = (error: unknown) => (typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '')

export function typesFor(target: DnsQuery): RecordType[] {
  if (target.kind === 'ip') return ['PTR']
  return RECORD_TYPES.filter(type => type !== 'PTR' && (type !== 'SRV' || target.name.startsWith('_')))
}

export async function lookupDns(
  target: DnsQuery,
  resolverId: DnsResolverId,
  createResolver: () => DnsResolver = () => new Resolver({ timeout: 3000, tries: 2 }),
): Promise<DnsResult> {
  const resolver = createResolver()
  resolver.setServers([...DNS_RESOLVERS[resolverId]])
  const name = target.kind === 'ip' ? target.address : target.name
  const types = typesFor(target)
  let missing = 0

  const answers = await Promise.all(
    types.map(async (type): Promise<DnsAnswer> => {
      try {
        return { type, records: await query(resolver, type, name) }
      } catch (error) {
        const code = errorCode(error)
        if (code === 'ENOTFOUND') missing++
        if (code === 'ENODATA' || code === 'ENOTFOUND') return { type, records: [] }
        return { type, records: [], error: code === 'ETIMEOUT' ? 'timeout' : 'failed' }
      }
    }),
  )

  return { name, answers, notFound: missing === types.length }
}
