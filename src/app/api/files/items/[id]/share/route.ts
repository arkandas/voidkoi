import { NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { ownedItem } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { shareInfo } from '@/modules/files/lib/shares';
import { parseId } from '@/lib/validate';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    return NextResponse.json(await shareInfo(item.id));
  });
}
