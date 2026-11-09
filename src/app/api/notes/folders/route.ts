import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderName, toFolderDto } from '@/modules/notes/lib/notes';

export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const folders = await prisma.noteFolder.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } });
    return NextResponse.json(folders.map(toFolderDto));
  });
}

export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const name = parseFolderName((await readJson(request))?.name);
    if (await prisma.noteFolder.count({ where: { user_id: user.id, name } })) return apiError('nameTaken', 409);
    const folder = await prisma.noteFolder.create({ data: { name, user_id: user.id } });
    return NextResponse.json(toFolderDto(folder), { status: 201 });
  });
}
