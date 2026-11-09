import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { endOf, NOTE_BODY_BYTES, parseContent, parseTitle, toNoteDto, usableFolder } from '@/modules/notes/lib/notes';

export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const notes = await prisma.note.findMany({
      where: { user_id: user.id, deleted_at: null },
      orderBy: [{ folder: 'asc' }, { position: 'asc' }],
    });
    return NextResponse.json(notes.map(toNoteDto));
  });
}

/** A new note, at the end of its folder. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request, NOTE_BODY_BYTES);
    if (!body) return apiError('invalidInput', 400);
    const title = body.title === undefined ? 'Untitled' : parseTitle(body.title);
    const content = body.content === undefined ? '' : parseContent(body.content);
    const folder = body.folder === undefined ? '' : await usableFolder(user.id, body.folder);
    const note = await prisma.note.create({
      data: { title, content, folder, position: await endOf(user.id, folder), user_id: user.id },
    });
    return NextResponse.json(toNoteDto(note), { status: 201 });
  });
}
