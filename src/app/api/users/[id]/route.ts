import { NextRequest, NextResponse } from 'next/server';
import { deleteAccount, toAdminUser } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { isUserRole, parseId } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/** Make someone an administrator, or not. Not yourself: there has to be one left. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const admin = await requireAdmin();
    const id = parseId((await params).id);
    if (!id) return apiError('userNotFound', 404);
    if (id === admin.id) return apiError('cannotChangeOwnRole', 400);
    const body = await readJson(request);
    if (!isUserRole(body?.role)) return apiError('invalidRole', 400);
    const { count } = await prisma.user.updateMany({ where: { id }, data: { role: body.role } });
    if (count === 0) return apiError('userNotFound', 404);
    return NextResponse.json(toAdminUser(await prisma.user.findUniqueOrThrow({ where: { id } })));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteUserFailed', async () => {
    const admin = await requireAdmin();
    const id = parseId((await params).id);
    if (!id) return apiError('userNotFound', 404);
    await deleteAccount(admin.id, id);
    return NextResponse.json({ ok: true });
  });
}
