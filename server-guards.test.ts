import { describe, expect, it } from 'vitest';

import { clientOf, crossSiteWrite, oversizedAuthBody, publicOriginOf, routedPath } from './server-guards.ts';

const ORIGIN = 'https://suite.example.com';

describe('writes to the API from another site', () => {
  it('are refused when the browser says they came from elsewhere', () => {
    expect(crossSiteWrite('POST', '/api/notes', { 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(true);
    expect(crossSiteWrite('DELETE', '/api/files/items/1', { 'sec-fetch-site': 'same-site' }, ORIGIN)).toBe(true);
  });

  it('pass from the suite’s own pages', () => {
    expect(crossSiteWrite('POST', '/api/notes', { 'sec-fetch-site': 'same-origin' }, ORIGIN)).toBe(false);
  });

  it('are judged by Origin when the browser sends no Sec-Fetch-Site', () => {
    expect(crossSiteWrite('PATCH', '/api/tasks/boards/1', { origin: 'https://evil.example.com' }, ORIGIN)).toBe(true);
    expect(crossSiteWrite('PATCH', '/api/tasks/boards/1', { origin: ORIGIN }, ORIGIN)).toBe(false);
    expect(crossSiteWrite('PATCH', '/api/x', { origin: 'http://localhost:3000', host: 'localhost:3000' }, null)).toBe(false);
  });

  it('leave reads, NextAuth, the share target and clients without a browser alone', () => {
    expect(crossSiteWrite('GET', '/api/notes', { 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(false);
    expect(crossSiteWrite('POST', '/share-target', { 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(false);
    expect(crossSiteWrite('POST', '/api/auth/callback/credentials', { 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(false);
    expect(crossSiteWrite('POST', '/api/notes', {}, ORIGIN)).toBe(false);
  });

  it('can’t be dodged with an encoded or dotted spelling of the path', () => {
    const away = { 'sec-fetch-site': 'same-site' };
    for (const url of [
      '/%61pi/talk/push/subscriptions',
      '/a%70i/talk/groups',
      '/api%2Ftalk%2Fpush%2Ftest',
      '/api/auth/../talk/push/subscriptions',
      '/api/auth/%2e%2e/talk/calls/seen',
      '/x/../api/notes',
      '/api/auth\\..\\talk',
      '/%E0%A4%A',
    ]) {
      expect(crossSiteWrite('POST', url, away, ORIGIN), url).toBe(true);
    }
  });

  it('cover writes to pages too', () => {
    expect(crossSiteWrite('POST', '/notes', { 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(true);
  });

  it('read the public origin from the configured URL', () => {
    expect(publicOriginOf('https://suite.example.com/')).toBe(ORIGIN);
    expect(publicOriginOf(undefined)).toBeNull();
    expect(publicOriginOf('not a url')).toBeNull();
  });
});

describe('the client’s address', () => {
  it('is the last forwarded address behind a proxy on the network', () => {
    expect(clientOf('172.18.0.5', '1.2.3.4, 81.40.10.2')).toBe('81.40.10.2');
    expect(clientOf('::ffff:192.168.1.10', '81.40.10.2')).toBe('81.40.10.2');
  });

  it('ignores forwarding headers sent straight from the internet', () => {
    expect(clientOf('81.40.10.2', '10.0.0.1')).toBe('81.40.10.2');
  });

  it('is the connection’s own without a proxy', () => {
    expect(clientOf('127.0.0.1', undefined)).toBe('127.0.0.1');
    expect(clientOf(undefined, undefined)).toBe('local');
  });
});

describe('the path the router sees', () => {
  it('is decoded, with dot segments resolved', () => {
    expect(routedPath('/%61pi/x?y=1')).toBe('/api/x');
    expect(routedPath('/a/./b/../c')).toBe('/a/c');
    expect(routedPath('/%E0%A4%A')).toBeNull();
  });
});

describe('bodies sent to NextAuth', () => {
  it('pass when they are the size of a sign-in form', () => {
    expect(oversizedAuthBody('POST', '/api/auth/callback/credentials', { 'content-length': '120' })).toBeNull();
    expect(oversizedAuthBody('GET', '/api/auth/session', {})).toBeNull();
    expect(oversizedAuthBody('POST', '/api/notes', { 'content-length': '9999999' })).toBeNull();
  });

  it('are refused when larger, or streamed without a length', () => {
    expect(oversizedAuthBody('POST', '/api/auth/signin/oidc', { 'content-length': String(10 * 1024 * 1024) })).toBe(413);
    expect(oversizedAuthBody('POST', '/%61pi/auth/signout', { 'transfer-encoding': 'chunked' })).toBe(411);
  });
});
