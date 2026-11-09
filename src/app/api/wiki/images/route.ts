import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { IMAGE_MAX_BYTES, storeImage } from '@/modules/wiki/lib/images';
import { requireEditor } from '@/modules/wiki/lib/access';

/** A picture for a page, sent as the form field `file`. */
export async function POST(request: NextRequest) {
  // Refused before reading: a form is the file plus a little.
  if (Number(request.headers.get('content-length') ?? 0) > IMAGE_MAX_BYTES + 1024 * 1024) return apiError('imageTooLarge', 413);
  return handle('uploadFailed', async () => {
    const user = await requireEditor();
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return apiError('invalidImage', 400);
    if (file.size > IMAGE_MAX_BYTES) return apiError('imageTooLarge', 413);
    const image = await storeImage(user, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(image, { status: 201 });
  });
}
