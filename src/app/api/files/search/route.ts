import { NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { searchItems } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
    return NextResponse.json(query ? await searchItems(user.id, query) : []);
  });
}
