import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAccountRow, listAccounts, toAdminUser } from '@/lib/accounts';
import { authConfig } from '@/lib/auth-config';
import { apiError, handle } from '@/lib/api-errors';
import { equalsIgnoringCase } from '@/lib/like';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { currentUser, requireAdmin } from '@/lib/session';
import { LIMITS, requiredText, isEmail, isUserRole } from '@/lib/validate';

export async function GET() {
  return handle('fetchUsersFailed', async () => {
    await requireAdmin();
    return NextResponse.json(await listAccounts());
  });
}

/** A new account: the first one from /setup, the rest from Admin. Each chooses its apps when it first signs in. */
export async function POST(request: NextRequest) {
  if (authConfig.mode === 'oidc') return apiError('usersManagedByProvider', 403);

  return handle('createUserFailed', async () => {
    const body = await readJson(request);
    const isFirstUser = (await prisma.user.count()) === 0;
    const requester = isFirstUser ? null : await currentUser();
    if (!isFirstUser && requester?.role !== 'ADMIN') return apiError('unauthorized', 401);

    const username = requiredText(body?.username, LIMITS.username);
    const email = requiredText(body?.email, LIMITS.email);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !email || !password) return apiError('missingFields', 400);
    if (!isEmail(email)) return apiError('invalidEmail', 400);
    if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax) return apiError('passwordLength', 400);
    if (body?.role !== undefined && !isUserRole(body.role)) return apiError('invalidRole', 400);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: equalsIgnoringCase(email) }] },
    });
    if (existingUser) return apiError('userExists', 400);

    // Made under a lock: a request that found no accounts only goes through if it is still the first.
    const user = await createAccountRow(
      { username, email, password: await bcrypt.hash(password, 10) },
      { role: isUserRole(body?.role) ? body.role : 'USER', allowedAfterFirst: requester?.role === 'ADMIN' },
    );

    return NextResponse.json(toAdminUser(user), { status: 201 });
  });
}
