import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: number; username: string; email: string; oidc_sub: string | null; role?: string };

const users = vi.hoisted(() => [] as Row[]);
vi.mock('@/lib/prisma', () => {
  const prisma = {
    // One connection in the tests: a transaction is the same client, and the lock is a no-op.
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
    $executeRaw: async () => 0,
    user: {
      findUnique: async ({ where }: { where: { oidc_sub?: string; username?: string } }) =>
        users.find(u =>
          where.oidc_sub !== undefined ? u.oidc_sub === where.oidc_sub : u.username === where.username
        ) ?? null,
      count: async () => users.length,
      // As PostgreSQL's ILIKE reads the pattern Prisma sends: % and _ match anything unless escaped.
      findFirst: async ({ where }: { where: { email: { equals: string } } }) => {
        const pattern = where.email.equals.replace(/\\(.)|([%_])|([^\\%_]+)/g, (_all, escaped?: string, wild?: string, plain?: string) =>
          escaped !== undefined ? escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : wild === '%' ? '.*' : wild === '_' ? '.' : plain!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        );
        return users.find(u => new RegExp(`^${pattern}$`, 'i').test(u.email)) ?? null;
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<Row> }) =>
        Object.assign(users.find(u => u.id === where.id)!, data),
      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row = { id: users.length + 1, ...data };
        users.push(row);
        return row;
      },
    },
  };
  return { prisma };
});

import { createAccount, endSessionUrl, findAccount, proposedUsername } from './oidc';

const add = (row: Omit<Row, 'id'>) => users.push({ id: users.length + 1, ...row });

beforeEach(() => {
  users.length = 0;
});

describe('findAccount', () => {
  it('returns the account already linked to this person', async () => {
    add({ username: 'ana', email: 'ana@example.com', oidc_sub: 'sub-ana' });

    const account = await findAccount({ sub: 'sub-ana', email: 'ana@example.com', preferred_username: 'ana' });

    expect(account).toMatchObject({ id: 1 });
    expect(users).toHaveLength(1);
  });

  it('links an existing account with the same verified email, ignoring case', async () => {
    add({ username: 'guille', email: 'Guille@Example.com', oidc_sub: null });

    const account = await findAccount({ sub: 'sub-g', email: 'guille@example.com', email_verified: true, preferred_username: 'guille' });

    expect(account).toMatchObject({ id: 1 });
    expect(users[0].oidc_sub).toBe('sub-g');
  });

  it('never links on an email the provider hasn’t verified', async () => {
    add({ username: 'ana', email: 'ana@example.com', oidc_sub: null });

    expect(await findAccount({ sub: 'sub-x', email: 'ana@example.com', preferred_username: 'x' })).toBeNull();
    expect(await findAccount({ sub: 'sub-x', email: 'ana@example.com', email_verified: false, preferred_username: 'x' })).toBeNull();
    expect(users[0].oidc_sub).toBeNull();
  });

  it('takes an email with wildcard characters literally', async () => {
    add({ username: 'ana', email: 'ana@example.com', oidc_sub: null });

    const account = await findAccount({ sub: 'sub-x', email: '%@example.com', email_verified: true, preferred_username: 'x' });

    expect(account).toBe('new');
    expect(users[0].oidc_sub).toBeNull();
  });

  it('refuses an email that is already linked to someone else', async () => {
    add({ username: 'ana', email: 'ana@example.com', oidc_sub: 'sub-ana' });

    const account = await findAccount({ sub: 'sub-other', email: 'ana@example.com', preferred_username: 'ana' });

    expect(account).toBeNull();
    expect(users[0].oidc_sub).toBe('sub-ana');
  });

  it('creates nothing for someone new, who is asked first', async () => {
    const account = await findAccount({ sub: 'sub-new', email: 'new@example.com', preferred_username: 'new' });

    expect(account).toBe('new');
    expect(users).toHaveLength(0);
  });

  it('refuses a first sign-in without an email', async () => {
    const account = await findAccount({ sub: 'sub-d', preferred_username: 'dan' });

    expect(account).toBeNull();
    expect(users).toHaveLength(0);
  });

  it('copies a changed username and email from the provider', async () => {
    add({ username: 'old-name', email: 'old@example.com', oidc_sub: 'sub-g' });

    const account = await findAccount({ sub: 'sub-g', email: 'new@example.com', preferred_username: 'new-name' });

    expect(account).toMatchObject({ id: 1, username: 'new-name', email: 'new@example.com' });
  });

  it('keeps the old username or email when another account already has the new one', async () => {
    add({ username: 'old-name', email: 'me@example.com', oidc_sub: 'sub-g' });
    add({ username: 'new-name', email: 'taken@example.com', oidc_sub: null });

    const account = await findAccount({ sub: 'sub-g', email: 'TAKEN@example.com', preferred_username: 'new-name' });

    expect(account).toMatchObject({ id: 1, username: 'old-name', email: 'me@example.com' });
  });

  it('only changes the email case when the address itself is the same', async () => {
    add({ username: 'ana', email: 'Ana@Example.com', oidc_sub: 'sub-ana' });

    const account = await findAccount({ sub: 'sub-ana', email: 'ana@example.com', preferred_username: 'ana' });

    expect(account).toMatchObject({ email: 'Ana@Example.com' });
  });
});

describe('createAccount', () => {
  it('names the account after the provider username, numbering it if taken', async () => {
    add({ username: 'bob', email: 'bob@example.com', oidc_sub: null });

    const account = await createAccount({ sub: 'sub-bob2', email: 'robert@example.com', preferred_username: 'bob' });

    expect(account).toMatchObject({ username: 'bob2', email: 'robert@example.com', oidc_sub: 'sub-bob2' });
  });

  it('falls back to the email name when the provider sends no username', async () => {
    const account = await createAccount({ sub: 'sub-c', email: 'carla@example.com', preferred_username: '' });

    expect(account?.username).toBe('carla');
    expect(proposedUsername({ sub: 'sub-c', email: 'carla@example.com', preferred_username: '' })).toBe('carla');
  });

  it('makes the very first account the admin', async () => {
    const account = await createAccount({ sub: 'sub-first', email: 'first@example.com', preferred_username: 'first' });

    expect(account?.role).toBe('ADMIN');
  });

  it('makes every later account a regular user', async () => {
    add({ username: 'first', email: 'first@example.com', oidc_sub: 'sub-first', role: 'ADMIN' });

    const account = await createAccount({ sub: 'sub-second', email: 'second@example.com', preferred_username: 'second' });

    expect(account?.role).toBe('USER');
  });

  it('creates nothing without an email', async () => {
    expect(await createAccount({ sub: 'sub-d', preferred_username: 'dan' })).toBeNull();
    expect(users).toHaveLength(0);
  });
});

describe('endSessionUrl', () => {
  const config = { issuer: 'https://id.example.com/app', clientId: 'files', clientSecret: 'x', name: 'SSO' };

  it('signs out of the provider and comes back to the sign-in page', async () => {
    const fetch = vi.fn(async () => Response.json({ end_session_endpoint: 'https://id.example.com/app/end-session/' }));
    vi.stubGlobal('fetch', fetch);

    const url = new URL((await endSessionUrl(config, 'https://files.example.com/login?signedOut=1', 'id-token'))!);

    expect(url.origin + url.pathname).toBe('https://id.example.com/app/end-session/');
    expect(url.searchParams.get('id_token_hint')).toBe('id-token');
    expect(url.searchParams.get('client_id')).toBe('files');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://files.example.com/login?signedOut=1');
    expect(fetch).toHaveBeenCalledWith('https://id.example.com/app/.well-known/openid-configuration');

    // The address is looked up once.
    await endSessionUrl(config, 'https://files.example.com/login?signedOut=1');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('has nothing when the provider has no sign-out address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));

    expect(await endSessionUrl({ ...config, issuer: 'https://other.example.com' }, 'https://files.example.com/login')).toBeNull();
    vi.unstubAllGlobals();
  });
});
