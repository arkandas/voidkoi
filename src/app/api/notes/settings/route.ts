import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseNoteSettings, storedNoteSettings } from '@/modules/notes/lib/fonts';

/** The fonts and the text size, or the defaults until the account picks its own. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    return NextResponse.json(storedNoteSettings(await prisma.noteSettings.findUnique({ where: { user_id: user.id } })));
  });
}

/** All three at once. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const settings = parseNoteSettings(await readJson(request));
    if (!settings) return apiError('invalidInput', 400);
    const row = { text_font: settings.textFont, code_font: settings.codeFont, font_size: settings.fontSize };
    const saved = await prisma.noteSettings.upsert({
      where: { user_id: user.id },
      create: { user_id: user.id, ...row },
      update: row,
    });
    return NextResponse.json(storedNoteSettings(saved));
  });
}
