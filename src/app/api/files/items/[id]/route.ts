import { NextRequest, NextResponse } from 'next/server';
import type { ItemDetail } from '@/modules/files/lib/api-types';
import { apiError, handle } from '@/lib/api-errors';
import { crumbsOf, describe, moveItems, ownedItem, renameItem, toPerson, visibleItem } from '@/modules/files/lib/items';
import { cleanName } from '@/modules/files/lib/names';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderId, parseId } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const access = await visibleItem(user.id, parseId((await params).id));
    const [item] = await describe([access.item], access.role === 'owner', user.id);
    const owner = access.role === 'viewer'
      ? await prisma.user.findUnique({ where: { id: access.item.owner_id } })
      : null;
    const detail: ItemDetail = {
      item: item!,
      crumbs: await crumbsOf(access.item.id, access.shareRootId),
      role: access.role,
      owner: owner ? toPerson(owner) : null,
    };
    return NextResponse.json(detail);
  });
}

/** Rename with `name`, or move with `parentId` (null for the top of My files). */
export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const item = await ownedItem(user.id, parseId((await params).id));
    const body = await readJson(request);
    let result = item;

    if (body && 'name' in body) {
      const name = cleanName(body.name);
      if (!name) return apiError('invalidName', 400);
      result = await renameItem(user.id, item.id, name);
    }
    if (body && 'parentId' in body) {
      const parentId = parseFolderId(body.parentId);
      if (parentId === undefined) return apiError('folderNotFound', 404);
      const [moved] = await moveItems(user.id, [item.id], parentId);
      if (moved) result = moved;
    }

    const [dto] = await describe([result], true, user.id);
    return NextResponse.json(dto);
  });
}
