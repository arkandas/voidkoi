import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { baseCookieOptions } from '@/lib/auth-cookies';
import { clientAddress } from '@/lib/rate-limit';
import { blocked, fail } from '@/modules/wiki/lib/attempts';
import { readJson } from '@/lib/request';
import { parseId } from '@/lib/validate';
import { checkLockPassword, rootLock, UNLOCK_SECONDS, unlockCookieName, unlockValue, wikiContext } from '@/modules/wiki/lib/wiki';

const ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * The password of a page, a folder or the wiki: `{ nodeId, password }`, with
 * no nodeId for the wiki's. Right, and this browser reads what it protects for a week.
 */
export async function POST(request: NextRequest) {
  return handle('generic', async () => {
    const body = await readJson(request);
    const { index, settings } = await wikiContext();
    const nodeId = body?.nodeId === null || body?.nodeId === undefined ? null : parseId(body.nodeId);
    const entry = nodeId === null ? null : index.byId.get(nodeId);
    if (nodeId !== null && !entry) return apiError('notFound', 404);
    const lock = entry ? entry.lock : rootLock(settings);
    if (lock.visibility !== 'password') return NextResponse.json({ ok: true });
    const key = `unlock:${lock.lockId}:${clientAddress(request)}`;
    if (blocked(key, ATTEMPTS, WINDOW_MS)) return apiError('tooManyAttempts', 429);

    const password = body?.password;
    if (typeof password !== 'string' || !(await checkLockPassword(lock, password))) {
      fail(key, WINDOW_MS);
      return apiError('wrongPassword', 401);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(unlockCookieName(lock.lockId), unlockValue(lock), {
      ...baseCookieOptions,
      httpOnly: true,
      maxAge: UNLOCK_SECONDS,
    });
    return response;
  });
}
