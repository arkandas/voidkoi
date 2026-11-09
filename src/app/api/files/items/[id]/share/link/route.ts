import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { ownedItem } from '@/modules/files/lib/items';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { deleteLink, saveLink, shareInfo } from '@/modules/files/lib/shares';
import { LIMITS, parseExpiry, parseId, parseLinkPassword } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * Create or change the item's link. `password`: a new password, null to
 * remove it, left out to keep it. `expiresAt` and `maxDownloads`: null for none.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    const body = await readJson(request);
    if (!body) return apiError('invalidInput', 400);

    const access = body.access;
    if (access !== 'public' && access !== 'users') return apiError('invalidInput', 400);

    const password = parseLinkPassword(body);
    if (password === false) return apiError('invalidInput', 400);
    const expiresAt = parseExpiry(body.expiresAt);
    if (expiresAt === false) return apiError('invalidDate', 400);

    let maxDownloads: number | null = null;
    if (body.maxDownloads !== null && body.maxDownloads !== undefined) {
      const value = body.maxDownloads;
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > LIMITS.maxDownloads) {
        return apiError('invalidLimit', 400);
      }
      maxDownloads = value as number;
    }

    await saveLink(user, item, { access, password, expiresAt, maxDownloads });
    return NextResponse.json(await shareInfo(item.id));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    await deleteLink(item.id);
    return NextResponse.json(await shareInfo(item.id));
  });
}
