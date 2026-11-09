import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { toNoteDto } from '@/modules/notes/lib/notes';

/** The trash, the last thrown away first. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const notes = await prisma.note.findMany({
      where: { user_id: user.id, deleted_at: { not: null } },
      orderBy: { deleted_at: 'desc' },
    });
    return NextResponse.json(notes.map(toNoteDto));
  });
}

/** Empty it. Pictures only these notes used go with the next sweep. */
export async function DELETE() {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const { count } = await prisma.note.deleteMany({ where: { user_id: user.id, deleted_at: { not: null } } });
    return NextResponse.json({ deleted: count });
  });
}
