import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { restoreNode } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseId } from '@/lib/validate';

/** Back where it was, with everything that went with it. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('restoreFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    return NextResponse.json(await restoreNode(id));
  });
}
