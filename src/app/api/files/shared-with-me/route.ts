import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { sharedWithMe } from '@/modules/files/lib/shares';

export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    return NextResponse.json(await sharedWithMe(user.id));
  });
}
