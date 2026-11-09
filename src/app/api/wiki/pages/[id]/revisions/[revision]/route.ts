import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { revisionDetail } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseId } from '@/lib/validate';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; revision: string }> }) {
  return handle('loadFailed', async () => {
    await requireEditor();
    const { id: rawId, revision: rawRevision } = await params;
    const id = parseId(rawId);
    const revision = parseId(rawRevision);
    if (!id || !revision) return apiError('notFound', 404);
    return NextResponse.json(await revisionDetail(id, revision));
  });
}
