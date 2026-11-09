import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '@/modules/utilikit/lib/tool-error';
import { AddressFilter, fetchPublicText, isPrivateAddress, parseHttpUrl } from '@/modules/utilikit/lib/safe-fetch';

describe('isPrivateAddress', () => {
  it('flags private, loopback, link-local and reserved IPv4 ranges', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '127.0.0.1',
      '100.64.0.1',
      '100.127.255.255',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '192.0.0.8',
      '192.0.2.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('allows public IPv4 addresses next to those ranges', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '192.0.3.1', '192.169.0.1', '198.20.0.1']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('handles IPv6', () => {
    for (const address of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('applies the IPv4 rules to an IPv4 address carried inside IPv6', () => {
    const forms = {
      'IPv4-compatible': ['::127.0.0.1', '::7f00:1', '::10.0.0.1', '::c0a8:101', '::2'],
      'IPv4-mapped': ['::ffff:192.168.1.1', '::ffff:a9fe:a9fe'],
      'NAT64 well-known prefix': ['64:ff9b::127.0.0.1', '64:ff9b::7f00:1', '64:FF9B::A9FE:A9FE', '64:ff9b::10.1.2.3'],
      '6to4': ['2002:7f00:1::', '2002:a00:1::1', '2002:c0a8:101::1', '2002:a9fe:a9fe::'],
    };
    for (const [form, addresses] of Object.entries(forms)) {
      for (const address of addresses) expect(isPrivateAddress(address), `${form} ${address}`).toBe(true);
    }
    for (const address of ['::8.8.8.8', '::808:808', '::ffff:808:808', '64:ff9b::8.8.8.8', '64:ff9b::101:101', '2002:808:808::1']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('blocks the local-use NAT64 prefix, wherever its IPv4 part sits', () => {
    for (const address of ['64:ff9b:1::a00:1', '64:ff9b:1::808:808', '64:ff9b:1:ab00:7f:0:100::']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('refuses IPv4-translated, Teredo and site-local IPv6 outright', () => {
    for (const address of ['::ffff:0:7f00:1', '::ffff:0:8.8.8.8', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001::1', 'fec0::1', 'feff::1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    // Other 2001: addresses are ordinary global ones.
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('reads IPv6 by its groups, with or without a zone', () => {
    expect(isPrivateAddress('fe80::1%en0')).toBe(true);
    expect(isPrivateAddress('fcd::1')).toBe(false);
    expect(isPrivateAddress('1:2:3:4:5:6:7:8')).toBe(false);
  });

  it('treats anything that is not an IP address as blocked', () => {
    expect(isPrivateAddress('localhost')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

describe('parseHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(parseHttpUrl(' https://example.com/page ')?.href).toBe('https://example.com/page');
    expect(parseHttpUrl('http://example.com')?.protocol).toBe('http:');
  });

  it('rejects other schemes and garbage', () => {
    for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com', 'data:text/html,hi', 'example.com', '', 42, null]) {
      expect(parseHttpUrl(value)).toBeNull();
    }
  });
});

describe('fetchPublicText', () => {
  let server: http.Server;
  let base: string;
  let hits = 0;
  const allowAll = () => false;
  const onlyTenBlocked = (address: string) => address.startsWith('10.');

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      hits++;
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/page') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<title>Hola, señor</title>');
      } else if (url.pathname === '/redirect') {
        response.writeHead(302, { Location: '/page' });
        response.end();
      } else if (url.pathname === '/loop') {
        response.writeHead(302, { Location: '/loop' });
        response.end();
      } else if (url.pathname === '/to-private') {
        response.writeHead(302, { Location: 'http://10.255.255.1/' });
        response.end();
      } else if (url.pathname === '/to-file') {
        response.writeHead(302, { Location: 'file:///etc/passwd' });
        response.end();
      } else if (url.pathname === '/huge') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        const chunk = 'a'.repeat(64 * 1024);
        for (let i = 0; i < 64; i++) response.write(chunk);
        response.end();
      } else if (url.pathname === '/headers') {
        response.writeHead(200);
        response.end(JSON.stringify(request.headers));
      } else {
        response.writeHead(404, 'Not Found');
        response.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  const fetchText = (path: string, filter: AddressFilter = allowAll) => fetchPublicText(new URL(path, base), { 'User-Agent': 'test' }, filter);

  it('returns the body decoded as UTF-8', async () => {
    await expect(fetchText('/page')).resolves.toBe('<title>Hola, señor</title>');
  });

  it('follows redirects', async () => {
    await expect(fetchText('/redirect')).resolves.toContain('Hola');
  });

  it('sends the given headers and asks for an uncompressed body', async () => {
    const headers = JSON.parse(await fetchText('/headers'));
    expect(headers['user-agent']).toBe('test');
    expect(headers['accept-encoding']).toBe('identity');
  });

  it('gives up after too many redirects', async () => {
    await expect(fetchText('/loop')).rejects.toMatchObject({ code: 'fetchFailed', detail: 'Too many redirects' });
  });

  it('reports HTTP errors', async () => {
    await expect(fetchText('/missing')).rejects.toMatchObject({ code: 'fetchFailed', detail: '404 Not Found' });
  });

  it('stops reading after 2 MB', async () => {
    const text = await fetchText('/huge');
    expect(text.length).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    expect(text.length).toBeLessThan(4 * 1024 * 1024);
  });

  it('blocks private IP literals without connecting', async () => {
    const before = hits;
    await expect(fetchPublicText(new URL('/page', base), {})).rejects.toMatchObject({ code: 'urlNotAllowed' });
    await expect(fetchPublicText(new URL('http://169.254.169.254/latest/meta-data/'), {})).rejects.toBeInstanceOf(ToolError);
    expect(hits).toBe(before);
  });

  it('blocks IPv6 literals that carry a private IPv4 address without connecting', async () => {
    const before = hits;
    const port = new URL(base).port;
    for (const host of ['[::127.0.0.1]', '[::ffff:7f00:1]', '[64:ff9b::127.0.0.1]', '[2002:7f00:1::]']) {
      await expect(fetchPublicText(new URL(`http://${host}:${port}/page`), {}), host).rejects.toMatchObject({ code: 'urlNotAllowed' });
    }
    expect(hits).toBe(before);
  });

  it('blocks host names that resolve to private addresses at connect time', async () => {
    const before = hits;
    const port = new URL(base).port;
    await expect(fetchPublicText(new URL(`http://localhost:${port}/page`), {})).rejects.toMatchObject({ code: 'urlNotAllowed' });
    expect(hits).toBe(before);
  });

  it('blocks redirects to private addresses', async () => {
    await expect(fetchText('/to-private', onlyTenBlocked)).rejects.toMatchObject({ code: 'urlNotAllowed', detail: '10.255.255.1' });
  });

  it('blocks redirects to other schemes', async () => {
    await expect(fetchText('/to-file')).rejects.toMatchObject({ code: 'urlNotAllowed' });
  });

  it('reports hosts that do not resolve', async () => {
    await expect(fetchPublicText(new URL('http://utilikit-does-not-exist.invalid/'), {})).rejects.toMatchObject({ code: 'fetchFailed' });
  });
});
