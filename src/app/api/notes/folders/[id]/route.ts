import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { ownedFolder, parseFolderColor, parseFolderIcon, parseFolderName, toFolderDto } from '@/modules/notes/lib/notes';

type Context = { params: Promise<{ id: string }> };

/** Name, colour or icon. A new name goes to the folder's notes too, those in the trash included. */
export async function PATCH(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const folder = await ownedFolder(user.id, parseId((await params).id));
    const body = await readJson(request);
    if (!body) return apiError('invalidInput', 400);

    const data: { name?: string; color?: string | null; icon?: string | null } = {};
    if ('color' in body) data.color = parseFolderColor(body.color);
    if ('icon' in body) data.icon = parseFolderIcon(body.icon);
    if ('name' in body) {
      const name = parseFolderName(body.name);
      if (name !== folder.name) {
        if (await prisma.noteFolder.count({ where: { user_id: user.id, name } })) return apiError('nameTaken', 409);
        data.name = name;
      }
    }

    const updated = await prisma.$transaction(async tx => {
      if (data.name) {
        await tx.note.updateMany({ where: { user_id: user.id, folder: folder.name }, data: { folder: data.name } });
      }
      return tx.noteFolder.update({ where: { id: folder.id }, data });
    });
    return NextResponse.json(toFolderDto(updated));
  });
}

/** The folder goes; its notes stay, out of any folder. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const folder = await ownedFolder(user.id, parseId((await params).id));
    await prisma.$transaction([
      prisma.note.updateMany({ where: { user_id: user.id, folder: folder.name }, data: { folder: '' } }),
      prisma.noteFolder.delete({ where: { id: folder.id } }),
    ]);
    return NextResponse.json({ ok: true });
  });
}
