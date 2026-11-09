import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { revisions } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseId } from '@/lib/validate';

/** Every published version of a page, newest first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    return NextResponse.json(await revisions(id));
  });
}
