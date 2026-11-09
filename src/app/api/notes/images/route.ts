import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { BodyTooLarge, readBody } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { imageId, imageUrl, MAX_IMAGE_BYTES, roomFor, sniffImageType, storeImage } from '@/modules/notes/lib/images';

/** Its size as the browser measured it; 0 when it couldn't. */
function dimension(value: FormDataEntryValue | null): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 100_000 ? number : 0;
}

/** A picture pasted or dropped into a note. */
export async function POST(request: NextRequest) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    // Read with a hard limit, declared length or not, so a big body never sits in memory.
    let body: Buffer;
    try {
      body = await readBody(request, MAX_IMAGE_BYTES + 64 * 1024);
    } catch (error) {
      if (error instanceof BodyTooLarge) return apiError('imageTooLarge', 413);
      throw error;
    }
    const form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } })
      .formData()
      .catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) return apiError('invalidImage', 415);
    if (file.size > MAX_IMAGE_BYTES) return apiError('imageTooLarge', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return apiError('invalidImage', 415);
    if (!(await roomFor(user.id, imageId(user.id, bytes), bytes.length))) return apiError('quotaExceeded', 413);

    const size = { width: dimension(form.get('width')), height: dimension(form.get('height')) };
    const id = await storeImage(user.id, type, bytes, size);
    return NextResponse.json({ id, url: imageUrl(id), ...size }, { status: 201 });
  });
}
