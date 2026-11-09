import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { usageByUser } from '@/modules/files/lib/settings';
import { toStorageUser } from '@/modules/files/lib/status';

/** Everyone's storage, for the administrator. */
export async function GET() {
  return handle('loadFailed', async () => {
    await requireAdmin();
    const [users, usage] = await Promise.all([prisma.user.findMany({ orderBy: { created_at: 'asc' } }), usageByUser()]);
    return NextResponse.json(users.map(user => toStorageUser(user, usage.get(user.id) ?? 0)));
  });
}
