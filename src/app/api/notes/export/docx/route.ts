import { NextRequest } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { contentDisposition } from '@/lib/http';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { noteToDocxBuffer } from '@/modules/notes/lib/docx';
import { slugify } from '@/modules/notes/lib/export';
import { LIMITS, NOTE_BODY_BYTES } from '@/modules/notes/lib/notes';

/** The note as the editor has it, which may be ahead of what is saved, as a Word document. */
export async function POST(request: NextRequest) {
  return handle('generic', async () => {
    const user = await requireUser();
    const body = await readJson(request, NOTE_BODY_BYTES);
    const title = typeof body?.title === 'string' ? body.title : '';
    const content = body?.content;
    if (typeof content !== 'string' || content.length > LIMITS.content) return apiError('invalidInput', 400);

    const buffer = await noteToDocxBuffer(content, user.id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition('attachment', `${slugify(title)}.docx`),
      },
    });
  });
}
