import { describe, expect, it } from 'vitest'
import { lookupDns, normalizeQuery, typesFor, type DnsResolver } from '@/modules/utilikit/lib/dns-lookup'

describe('normalizeQuery', () => {
  it('accepts plain domains and lowercases them', () => {
    expect(normalizeQuery('Example.COM')).toEqual({ kind: 'domain', name: 'example.com' })
    expect(normalizeQuery('_dmarc.example.com.')).toEqual({ kind: 'domain', name: '_dmarc.example.com' })
  })

  it('pulls the host out of URLs and host:port values', () => {
    expect(normalizeQuery('https://www.example.com/path?q=1')).toEqual({ kind: 'domain', name: 'www.example.com' })
    expect(normalizeQuery('example.com:8443')).toEqual({ kind: 'domain', name: 'example.com' })
    expect(normalizeQuery('example.com/some/page')).toEqual({ kind: 'domain', name: 'example.com' })
  })

  it('converts international domains to punycode', () => {
    expect(normalizeQuery('münchen.de')).toEqual({ kind: 'domain', name: 'xn--mnchen-3ya.de' })
  })

  it('recognizes IP addresses', () => {
    expect(normalizeQuery('8.8.8.8')).toEqual({ kind: 'ip', address: '8.8.8.8' })
    expect(normalizeQuery('[2606:4700::1111]')).toEqual({ kind: 'ip', address: '2606:4700::1111' })
    expect(normalizeQuery('2606:4700::1111')).toEqual({ kind: 'ip', address: '2606:4700::1111' })
  })

  it('rejects anything that is not a host name', () => {
    for (const value of ['', '   ', 'exa mple.com', '-bad.com', 'bad-.com', 'a'.repeat(64) + '.com', 'http://', 42]) {
      expect(normalizeQuery(value), String(value)).toBeNull()
    }
  })
})

describe('typesFor', () => {
  it('only asks for SRV records on service names, and only PTR for addresses', () => {
    expect(typesFor({ kind: 'domain', name: 'example.com' })).not.toContain('SRV')
    expect(typesFor({ kind: 'domain', name: '_sip._tcp.example.com' })).toContain('SRV')
    expect(typesFor({ kind: 'ip', address: '1.1.1.1' })).toEqual(['PTR'])
  })
})

function failure(code: string) {
  return Object.assign(new Error(code), { code })
}

function fakeResolver(overrides: Partial<Record<keyof DnsResolver, () => unknown>>): DnsResolver {
  const missing = () => Promise.reject(failure('ENODATA'))
  const handler = { setServers: () => {}, ...overrides }
  return new Proxy({} as DnsResolver, {
    get: (_, key: string) => (handler as Record<string, unknown>)[key] ?? missing,
  })
}

describe('lookupDns', () => {
  it('collects every record type, sorting MX by priority', async () => {
    const servers: string[][] = []
    const resolver = fakeResolver({
      setServers: ((list: string[]) => servers.push(list)) as () => unknown,
      resolve4: async () => [{ address: '93.184.215.14', ttl: 300 }],
      resolveMx: async () => [
        { exchange: 'backup.example.com', priority: 20 },
        { exchange: 'mail.example.com', priority: 10 },
      ],
      resolveTxt: async () => [['v=spf1 ', '-all']],
      resolveSoa: async () => ({ nsname: 'ns.example.com', hostmaster: 'admin.example.com', serial: 1, refresh: 2, retry: 3, expire: 4, minttl: 5 }),
      resolveCaa: async () => [{ critical: 0, issue: 'letsencrypt.org' }],
    })

    const result = await lookupDns({ kind: 'domain', name: 'example.com' }, 'quad9', () => resolver)
    const byType = Object.fromEntries(result.answers.map(answer => [answer.type, answer.records]))

    expect(servers).toEqual([['9.9.9.9', '149.112.112.112']])
    expect(result.notFound).toBe(false)
    expect(byType.A).toEqual([{ value: '93.184.215.14', ttl: 300 }])
    expect(byType.MX).toEqual([
      { value: 'mail.example.com', priority: 10 },
      { value: 'backup.example.com', priority: 20 },
    ])
    expect(byType.TXT).toEqual([{ value: 'v=spf1 -all' }])
    expect(byType.SOA).toEqual([{ value: 'ns.example.com admin.example.com 1 2 3 4 5' }])
    expect(byType.CAA).toEqual([{ value: '0 issue "letsencrypt.org"' }])
    expect(byType.AAAA).toEqual([])
  })

  it('reports a domain that does not exist', async () => {
    const resolver = fakeResolver(
      Object.fromEntries(
        ['resolve4', 'resolve6', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveTxt', 'resolveSoa', 'resolveCaa'].map(method => [
          method,
          () => Promise.reject(failure('ENOTFOUND')),
        ]),
      ),
    )
    const result = await lookupDns({ kind: 'domain', name: 'nope.invalid' }, 'cloudflare', () => resolver)
    expect(result.notFound).toBe(true)
  })

  it('marks types that timed out or failed', async () => {
    const resolver = fakeResolver({
      resolve4: () => Promise.reject(failure('ETIMEOUT')),
      resolveNs: () => Promise.reject(failure('ESERVFAIL')),
    })
    const result = await lookupDns({ kind: 'domain', name: 'example.com' }, 'google', () => resolver)
    expect(result.answers.find(answer => answer.type === 'A')).toEqual({ type: 'A', records: [], error: 'timeout' })
    expect(result.answers.find(answer => answer.type === 'NS')).toEqual({ type: 'NS', records: [], error: 'failed' })
  })

  it('looks up the name of an address', async () => {
    const resolver = fakeResolver({ reverse: async () => ['one.one.one.one'] })
    const result = await lookupDns({ kind: 'ip', address: '1.1.1.1' }, 'cloudflare', () => resolver)
    expect(result).toEqual({ name: '1.1.1.1', answers: [{ type: 'PTR', records: [{ value: 'one.one.one.one' }] }], notFound: false })
  })
})
