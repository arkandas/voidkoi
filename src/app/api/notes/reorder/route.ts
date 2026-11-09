import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parsePlaces } from '@/modules/notes/lib/notes';

/** New places for the notes of a folder, after one was dragged. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const places = parsePlaces((await readJson(request))?.updates);
    if (!places) return apiError('invalidInput', 400);
    await prisma.$transaction(
      places.map(({ id, position }) => prisma.note.updateMany({ where: { id, user_id: user.id }, data: { position } })),
    );
    return NextResponse.json({ ok: true });
  });
}
