import { NextRequest, NextResponse } from 'next/server';
import { toPerson } from '@/lib/accounts';
import { handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { isAppId } from '@/modules/registry';

/** Everyone else with an account, for sharing or talking to: `?app=` keeps those who use that app. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const me = await requireUser();
    const app = request.nextUrl.searchParams.get('app');
    const users = await prisma.user.findMany({
      where: { NOT: { id: me.id }, ...(isAppId(app) ? { apps: { has: app } } : {}) },
      orderBy: { username: 'asc' },
    });
    return NextResponse.json(users.map(toPerson));
  });
}
