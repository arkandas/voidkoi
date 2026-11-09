import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { baseCookieOptions } from '@/lib/auth-cookies';
import { allow, clientAddress } from '@/lib/rate-limit';
import { readJson } from '@/lib/request';
import { checkLinkPassword, unlockCookieName, unlockValue } from '@/modules/files/lib/shares';
import { findUploadLink, uploadLinkState } from '@/modules/files/lib/upload-links';

const ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/** Check an upload link's password and remember, for a day, that this browser knows it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('generic', async () => {
    const { token } = await params;
    const link = await findUploadLink(token);
    if (!link || uploadLinkState(link) !== 'ok' || !link.password_hash) return apiError('linkNotFound', 404);
    if (!allow(`${clientAddress(request)}:${token}`, ATTEMPTS, WINDOW_MS)) return apiError('tooManyAttempts', 429);

    const password = (await readJson(request))?.password;
    if (typeof password !== 'string' || !(await checkLinkPassword(link, password))) {
      return apiError('wrongPassword', 401);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(unlockCookieName(token, 'upload'), unlockValue(link, 'upload'), {
      ...baseCookieOptions,
      httpOnly: true,
      maxAge: 24 * 60 * 60,
    });
    return response;
  });
}
