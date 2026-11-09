import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { setPassword } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { authConfig } from '@/lib/auth-config';
import { allow } from '@/lib/rate-limit';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { LIMITS } from '@/lib/validate';

const ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

/** Change your own password: `{ current, password }`. Other sessions of the account end. */
export async function PUT(request: NextRequest) {
  if (authConfig.mode === 'oidc') return apiError('usersManagedByProvider', 403);
  return handle('saveFailed', async () => {
    const user = await requireUser();
    if (!user.password) return apiError('usersManagedByProvider', 403);
    if (!allow(`password:${user.id}`, ATTEMPTS, WINDOW_MS)) return apiError('tooManyAttempts', 429);
    const body = await readJson(request);
    const current = typeof body?.current === 'string' ? body.current : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!(await bcrypt.compare(current, user.password))) return apiError('wrongPassword', 401);
    if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax) return apiError('passwordLength', 400);
    await setPassword(user.id, password);
    return NextResponse.json({ ok: true });
  });
}
