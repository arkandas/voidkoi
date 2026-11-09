import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireAdmin } from '@/lib/session';
import { listMembers } from '@/modules/wiki/lib/members';

/** The accounts that use the wiki, for Admin: who writes and who reads. */
export async function GET() {
  return handle('loadFailed', async () => {
    await requireAdmin();
    return NextResponse.json(await listMembers());
  });
}
