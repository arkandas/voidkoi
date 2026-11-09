import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { publish } from '@/modules/wiki/lib/pages';
import { readJson } from '@/lib/request';
import { requireEditor } from '@/modules/wiki/lib/access';
import { LIMITS, withoutNul } from '@/modules/wiki/lib/validate';
import { parseId } from '@/lib/validate';

/** Publish the draft: `{ message, version }`. The message says what changed and may be left out. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('publishFailed', async () => {
    const user = await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const body = await readJson(request);
    const message = typeof body?.message === 'string' ? withoutNul(body.message).replace(/\s+/g, ' ').trim().slice(0, LIMITS.publishMessage) || null : null;
    const version = typeof body?.version === 'number' && Number.isInteger(body.version) ? body.version : null;
    await publish(user, id, message, version);
    return NextResponse.json({ ok: true });
  });
}
