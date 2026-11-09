import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { authConfig } from '@/lib/auth-config';
import { sessionCookieName } from '@/lib/auth-cookies';
import { endSessionUrl } from '@/lib/oidc';

/**
 * Where to go after signing out of Files: under OIDC, the provider's sign-out,
 * which ends its session too and comes back to the sign-in page.
 */
export async function POST(request: NextRequest) {
  const signedOut = new URL('/login?signedOut=1', process.env.NEXTAUTH_URL ?? request.nextUrl.origin).toString();
  if (authConfig.mode !== 'oidc') return NextResponse.json({ url: signedOut });

  const token = await getToken({ req: request, secret: process.env.VOIDKOI_NEXTAUTH_SECRET, cookieName: sessionCookieName });
  const idToken = typeof token?.idToken === 'string' ? token.idToken : undefined;
  const url = await endSessionUrl(authConfig.oidc, signedOut, idToken);
  return NextResponse.json({ url: url ?? signedOut });
}
