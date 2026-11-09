import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { ownedItem } from '@/modules/files/lib/items';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { shareInfo } from '@/modules/files/lib/shares';
import { deleteUploadLink, saveUploadLink } from '@/modules/files/lib/upload-links';
import { parseExpiry, parseId, parseLinkPassword } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * Create or change a folder's upload link. `password`: a new password, null
 * to remove it, left out to keep it. `expiresAt`: null for none.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    if (item.kind !== 'FOLDER') return apiError('invalidInput', 400);
    const body = await readJson(request);
    if (!body) return apiError('invalidInput', 400);
    const password = parseLinkPassword(body);
    if (password === false) return apiError('invalidInput', 400);
    const expiresAt = parseExpiry(body.expiresAt);
    if (expiresAt === false) return apiError('invalidDate', 400);
    await saveUploadLink(user, item, { password, expiresAt });
    return NextResponse.json(await shareInfo(item.id));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    await deleteUploadLink(item.id);
    return NextResponse.json(await shareInfo(item.id));
  });
}
