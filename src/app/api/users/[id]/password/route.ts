import { NextRequest, NextResponse } from 'next/server';
import { setPassword } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { authConfig } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { LIMITS, parseId } from '@/lib/validate';

/** An admin sets someone's password: `{ password }`. Their sessions end. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (authConfig.mode === 'oidc') return apiError('usersManagedByProvider', 403);
  return handle('saveFailed', async () => {
    await requireAdmin();
    const id = parseId((await params).id);
    if (!id || !(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) return apiError('userNotFound', 404);
    const body = await readJson(request);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax) return apiError('passwordLength', 400);
    await setPassword(id, password);
    return NextResponse.json({ ok: true });
  });
}
