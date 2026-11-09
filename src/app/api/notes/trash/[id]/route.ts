import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { ownedNote } from '@/modules/notes/lib/notes';

/** Delete a note in the trash for good. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const note = await ownedNote(user.id, parseId((await params).id));
    if (!note.deleted_at) return apiError('notFound', 404);
    await prisma.note.delete({ where: { id: note.id } });
    return NextResponse.json({ ok: true });
  });
}
