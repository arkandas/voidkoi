import { NextAuthOptions } from 'next-auth';
import { cookies } from 'next/headers';
import CredentialsProvider from 'next-auth/providers/credentials';
import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { allow } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/lib/auth-config';
import { createAccount, findAccount, oidcProvider, proposedUsername, type OidcProfile } from '@/lib/oidc';
import { sessionCookieName, callbackCookieName, csrfCookieName, newAccountCookieName, baseCookieOptions } from '@/lib/auth-cookies';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** A hash no password matches, compared against when the username doesn't exist. */
const NO_ONE = bcrypt.hashSync(randomBytes(18).toString('base64'), 10);

function headerValue(headers: unknown, name: string): string | undefined {
  const value = (headers as Record<string, string | string[] | undefined> | undefined)?.[name];
  return Array.isArray(value) ? value[0] : value;
}

const credentialsProvider = CredentialsProvider({
  name: 'Credentials',
  credentials: {
    username: { label: 'Username', type: 'text' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials, request) {
    if (!credentials?.username || !credentials?.password) {
      throw new Error('Missing credentials');
    }

    const address = headerValue(request?.headers, 'x-voidkoi-client') ?? 'local';
    if (
      !allow(`login:name:${credentials.username.toLowerCase()}`, 10, LOGIN_WINDOW_MS) ||
      !allow(`login:address:${address}`, 50, LOGIN_WINDOW_MS)
    ) {
      throw new Error('TooManyAttempts');
    }

    const user = await prisma.user.findUnique({ where: { username: credentials.username } });

    if (!user?.password) {
      // As long as a wrong password, so the time doesn't tell which usernames exist.
      await bcrypt.compare(credentials.password, NO_ONE);
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    return {
      id: user.id.toString(),
      email: user.email,
      name: user.username,
      role: user.role,
      sessionVersion: user.session_version,
    };
  },
});

const oidc = authConfig.mode === 'oidc' ? authConfig.oidc : null;

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: { ...baseCookieOptions, httpOnly: true },
    },
    callbackUrl: {
      name: callbackCookieName,
      options: baseCookieOptions,
    },
    csrfToken: {
      name: csrfCookieName,
      options: { ...baseCookieOptions, httpOnly: true },
    },
  },
  providers: oidc ? [oidcProvider(oidc)] : [credentialsProvider],
  callbacks: {
    async signIn({ account, profile }) {
      if (!oidc || account?.provider !== 'oidc') return true;
      if (!profile?.sub) return false;
      const person = profile as OidcProfile;
      const found = await findAccount(person);
      if (found !== 'new') return found !== null;

      // Someone without an account is asked first, on the sign-in page. A yes
      // there sets the cookie and signs in again, which lands here.
      const jar = await cookies();
      if (jar.get(newAccountCookieName)?.value === '1') {
        try {
          jar.delete(newAccountCookieName);
        } catch {
          // It expires on its own in two minutes.
        }
        return (await createAccount(person)) !== null;
      }
      return `/login?newAccount=${encodeURIComponent(proposedUsername(person))}`;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'oidc') {
        const dbUser = await prisma.user.findUniqueOrThrow({ where: { oidc_sub: account.providerAccountId } });
        token.id = dbUser.id.toString();
        token.name = dbUser.username;
        token.email = dbUser.email;
        token.role = dbUser.role;
        token.sv = dbUser.session_version;
        // For signing out of the provider too.
        token.idToken = account.id_token;
      } else if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.sv = token.sv ?? 0;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.VOIDKOI_NEXTAUTH_SECRET,
};
