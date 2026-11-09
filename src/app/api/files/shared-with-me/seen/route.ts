import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

/** Shared with me was opened: nothing in it is new any more. */
export async function POST() {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { shares_seen_at: new Date() } });
    return NextResponse.json({ ok: true });
  });
}
