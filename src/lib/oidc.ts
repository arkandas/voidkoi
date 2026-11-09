import type { OAuthConfig } from 'next-auth/providers/oauth';
import type { User } from '@/generated/prisma/client';
import { createAccountRow } from '@/lib/accounts';
import { equalsIgnoringCase } from '@/lib/like';
import { prisma } from '@/lib/prisma';
import type { OidcConfig } from '@/lib/auth-config';

export interface OidcProfile {
  sub: string;
  email?: string;
  preferred_username?: string;
  /** The person's full name, taken as the name others see when the account is made. */
  name?: string;
  /** Whether the provider checked the address belongs to them. Needed to link to an existing account. */
  email_verified?: boolean;
}

export function oidcProvider(config: OidcConfig): OAuthConfig<OidcProfile> {
  return {
    id: 'oidc',
    name: config.name,
    type: 'oauth',
    wellKnown: `${config.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: 'openid email profile' } },
    idToken: true,
    checks: ['pkce', 'state'],
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    profile: profile => ({
      id: profile.sub,
      name: profile.preferred_username ?? '',
      email: profile.email ?? '',
      role: 'USER',
    }),
  };
}

/**
 * The account someone signs in to: the one linked to them, or one with their
 * email that isn't linked yet. 'new' when they have none, so they are asked
 * before one is made. Null when they can't sign in.
 */
export async function findAccount(profile: OidcProfile): Promise<User | 'new' | null> {
  const linked = await prisma.user.findUnique({ where: { oidc_sub: profile.sub } });
  if (linked) return syncFromProvider(linked, profile);

  const email = profile.email?.trim();
  if (!email) return null;

  const sameEmail = await findByEmail(email);
  if (sameEmail) {
    // Linking hands over the account, so the address has to be the person's for sure.
    if (sameEmail.oidc_sub || profile.email_verified !== true) return null;
    const account = await prisma.user.update({ where: { id: sameEmail.id }, data: { oidc_sub: profile.sub } });
    return syncFromProvider(account, profile);
  }

  return 'new';
}

/** The account for someone who said yes to having one. */
export async function createAccount(profile: OidcProfile): Promise<User | null> {
  const email = profile.email?.trim();
  if (!email) return null;
  const username = await availableUsername(profile.preferred_username || email.split('@')[0]);
  // The provider vouches for whoever it lets through; the first of them is the admin.
  return createAccountRow({ username, email, name: profile.name?.trim() || null, oidc_sub: profile.sub }, { allowedAfterFirst: true });
}

/** The name an account would get, to show when asking. */
export function proposedUsername(profile: OidcProfile): string {
  return profile.preferred_username?.trim() || profile.email?.split('@')[0] || '';
}

const endpoints = new Map<string, string | null>();

/**
 * The provider's sign-out address, which comes back to `back`: signing out of
 * Files there signs out of the provider too. Null when the provider has none.
 */
export async function endSessionUrl(config: OidcConfig, back: string, idToken?: string): Promise<string | null> {
  if (!endpoints.has(config.issuer)) {
    try {
      const response = await fetch(`${config.issuer}/.well-known/openid-configuration`);
      const discovery = (await response.json()) as { end_session_endpoint?: string };
      endpoints.set(config.issuer, discovery.end_session_endpoint ?? null);
    } catch {
      return null;
    }
  }
  const endpoint = endpoints.get(config.issuer);
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('post_logout_redirect_uri', back);
  return url.toString();
}

async function syncFromProvider(user: User, profile: OidcProfile): Promise<User> {
  const data: { email?: string; username?: string } = {};

  const email = profile.email?.trim();
  if (email && email.toLowerCase() !== user.email.toLowerCase()) {
    const owner = await findByEmail(email);
    if (!owner) data.email = email;
  }

  const username = profile.preferred_username?.trim();
  if (username && username !== user.username) {
    const owner = await prisma.user.findUnique({ where: { username } });
    if (!owner) data.username = username;
  }

  if (Object.keys(data).length === 0) return user;
  return prisma.user.update({ where: { id: user.id }, data });
}

function findByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: equalsIgnoringCase(email) } });
}

async function availableUsername(wanted: string): Promise<string> {
  const base = wanted.trim() || 'user';
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate } });
    if (!taken) return candidate;
  }
}
