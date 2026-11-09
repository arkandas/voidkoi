export const DNS_RESOLVERS = {
  cloudflare: ['1.1.1.1', '1.0.0.1'],
  google: ['8.8.8.8', '8.8.4.4'],
  quad9: ['9.9.9.9', '149.112.112.112'],
} as const
export type DnsResolverId = keyof typeof DNS_RESOLVERS

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA', 'SRV', 'PTR'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export type DnsQuery = { kind: 'domain'; name: string } | { kind: 'ip'; address: string }

export interface DnsRecord {
  value: string
  ttl?: number
  priority?: number
}

export interface DnsAnswer {
  type: RecordType
  records: DnsRecord[]
  error?: 'timeout' | 'failed'
}

export interface DnsResult {
  name: string
  answers: DnsAnswer[]
  notFound: boolean
}
