import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { restoreRevision } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseId } from '@/lib/validate';

/** Put an old version's title and text into the draft, to publish again. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; revision: string }> }) {
  return handle('restoreFailed', async () => {
    const user = await requireEditor();
    const { id: rawId, revision: rawRevision } = await params;
    const id = parseId(rawId);
    const revision = parseId(rawRevision);
    if (!id || !revision) return apiError('notFound', 404);
    await restoreRevision(user, id, revision);
    return NextResponse.json({ ok: true });
  });
}
