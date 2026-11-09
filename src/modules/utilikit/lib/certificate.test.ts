import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { fetchServerCertificates, parseDistinguishedName, parsePem, parseServer, summarize } from '@/modules/utilikit/lib/certificate'

const fixture = (name: string) => readFileSync(path.join(process.cwd(), 'src/modules/utilikit/lib/fixtures', name), 'utf8')
const LEAF = fixture('test-leaf.pem')
const CA = fixture('test-ca.pem')

describe('parsePem', () => {
  it('reads every certificate in the text', () => {
    expect(parsePem(`junk before\n${LEAF}\n${CA}\njunk after`)).toHaveLength(2)
  })

  it('rejects text without certificates', () => {
    expect(() => parsePem('hello')).toThrow(expect.objectContaining({ code: 'certificateInvalid' }))
    expect(() => parsePem('-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----')).toThrow(
      expect.objectContaining({ code: 'certificateInvalid' }),
    )
  })
})

describe('parseDistinguishedName', () => {
  it('splits the fields, keeping equals signs inside values', () => {
    expect(parseDistinguishedName('C=ES\nO=Acme = Co\nCN=example.com')).toEqual([
      ['C', 'ES'],
      ['O', 'Acme = Co'],
      ['CN', 'example.com'],
    ])
  })
})

describe('summarize', () => {
  const [leaf, ca] = parsePem(`${LEAF}${CA}`)
  const now = new Date('2030-01-01T00:00:00Z')

  it('describes a server certificate', () => {
    const summary = summarize(leaf, now)
    expect(summary).toMatchObject({
      commonName: 'test.utilikit.dev',
      subject: [
        ['C', 'ES'],
        ['O', 'Utilikit'],
        ['CN', 'test.utilikit.dev'],
      ],
      issuer: [
        ['O', 'Utilikit'],
        ['CN', 'Utilikit Test CA'],
      ],
      altNames: ['test.utilikit.dev', 'www.test.utilikit.dev', '203.0.113.10'],
      isCA: false,
      selfSigned: false,
      keyType: 'RSA',
      keySize: 2048,
      signatureAlgorithm: 'ecdsa-with-SHA256',
      extendedKeyUsage: ['serverAuth', 'clientAuth'],
      status: 'valid',
    })
    expect(summary.serialNumber).toMatch(/^([0-9A-F]{2}:)+[0-9A-F]{2}$/)
    expect(summary.fingerprint256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(summary.daysLeft).toBeGreaterThan(30000)
  })

  it('recognizes a self-signed authority', () => {
    expect(summarize(ca, now)).toMatchObject({ commonName: 'Utilikit Test CA', isCA: true, selfSigned: true, keyType: 'EC', curve: 'prime256v1' })
  })

  it('reports expired and not yet valid certificates', () => {
    expect(summarize(leaf, new Date('2200-01-01T00:00:00Z'))).toMatchObject({ status: 'expired' })
    expect(summarize(leaf, new Date('2000-01-01T00:00:00Z'))).toMatchObject({ status: 'notYetValid' })
  })
})

describe('parseServer', () => {
  it('accepts hosts, URLs and host:port', () => {
    expect(parseServer('Example.com', '')).toEqual({ host: 'example.com', port: 443 })
    expect(parseServer('https://example.com:8443/path', '')).toEqual({ host: 'example.com', port: 8443 })
    expect(parseServer('mail.example.com:993', 443)).toEqual({ host: 'mail.example.com', port: 993 })
    expect(parseServer('example.com', 465)).toEqual({ host: 'example.com', port: 465 })
    expect(parseServer('[2606:4700::1111]:443', '')).toEqual({ host: '2606:4700::1111', port: 443 })
  })

  it('rejects bad hosts and ports', () => {
    expect(parseServer('', 443)).toBeNull()
    expect(parseServer('not a host', 443)).toBeNull()
    expect(parseServer('localhost', 443)).toBeNull()
    expect(parseServer('example.com', 70000)).toBeNull()
  })
})

describe('fetchServerCertificates', () => {
  it('refuses private addresses', async () => {
    await expect(fetchServerCertificates('127.0.0.1', 443)).rejects.toMatchObject({ code: 'urlNotAllowed' })
    await expect(fetchServerCertificates('192.168.1.1', 443)).rejects.toMatchObject({ code: 'urlNotAllowed' })
  })

  it('refuses names that resolve to private addresses', async () => {
    await expect(fetchServerCertificates('localhost.', 443)).rejects.toMatchObject({ code: 'urlNotAllowed' })
  })
})
