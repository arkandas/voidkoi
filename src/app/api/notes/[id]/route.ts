import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { endOf, NOTE_BODY_BYTES, ownedNote, parseContent, parseTitle, toNoteDto, usableFolder } from '@/modules/notes/lib/notes';

type Context = { params: Promise<{ id: string }> };

/** Title, text or folder. A note moved to another folder goes to its end. */
export async function PATCH(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const note = await ownedNote(user.id, parseId((await params).id));
    const body = await readJson(request, NOTE_BODY_BYTES);
    if (!body) return apiError('invalidInput', 400);

    const data: { title?: string; content?: string; folder?: string; position?: number } = {};
    if (body.title !== undefined) data.title = parseTitle(body.title);
    if (body.content !== undefined) data.content = parseContent(body.content);
    if (body.folder !== undefined) {
      const folder = await usableFolder(user.id, body.folder);
      if (folder !== note.folder) {
        data.folder = folder;
        data.position = await endOf(user.id, folder);
      }
    }

    const updated = await prisma.note.update({ where: { id: note.id }, data });
    return NextResponse.json(toNoteDto(updated));
  });
}

/** Into the trash. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const note = await ownedNote(user.id, parseId((await params).id));
    if (!note.deleted_at) await prisma.note.update({ where: { id: note.id }, data: { deleted_at: new Date() } });
    return NextResponse.json({ ok: true });
  });
}
