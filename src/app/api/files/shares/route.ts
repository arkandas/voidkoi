import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { myShares } from '@/modules/files/lib/shares';

/** Everything I share, by link or with people. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    return NextResponse.json(await myShares(user.id));
  });
}
