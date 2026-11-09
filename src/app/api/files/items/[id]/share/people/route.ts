import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { ownedItem } from '@/modules/files/lib/items';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { setPeople, shareInfo } from '@/modules/files/lib/shares';
import { parseId } from '@/lib/validate';

/** Share with exactly `userIds`; an empty list stops sharing with anyone. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    const body = await readJson(request);
    const ids = Array.isArray(body?.userIds) ? body.userIds.map(parseId) : null;
    if (!ids || ids.length > 500 || ids.some(id => id === null)) return apiError('invalidPeople', 400);
    await setPeople(user, item, [...new Set(ids as number[])]);
    return NextResponse.json(await shareInfo(item.id));
  });
}
