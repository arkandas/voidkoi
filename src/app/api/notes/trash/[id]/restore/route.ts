import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { endOf, folderExists, ownedNote, toNoteDto } from '@/modules/notes/lib/notes';

/** Back where it was, at the end of its folder, or out of any folder if that one is gone. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('restoreFailed', async () => {
    const user = await requireUser();
    const note = await ownedNote(user.id, parseId((await params).id));
    if (!note.deleted_at) return apiError('notFound', 404);
    const folder = (await folderExists(user.id, note.folder)) ? note.folder : '';
    const restored = await prisma.note.update({
      where: { id: note.id },
      data: { deleted_at: null, folder, position: await endOf(user.id, folder) },
    });
    return NextResponse.json(toNoteDto(restored));
  });
}
