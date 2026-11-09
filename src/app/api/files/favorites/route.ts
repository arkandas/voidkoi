import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { listFavorites } from '@/modules/files/lib/favorites';
import { requireUser } from '@/lib/session';

export async function GET() {
  return handle('loadFailed', async () => NextResponse.json(await listFavorites((await requireUser()).id)));
}
