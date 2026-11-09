import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/session';
import { imagePath, isImageId } from '@/modules/notes/lib/images';

/** A picture in a note, for the account that pasted it. It never changes, so it can be cached for good. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });

  const { id } = await params;
  const image = isImageId(id) ? await prisma.noteImage.findFirst({ where: { id, user_id: user.id } }) : null;
  if (!image) return new Response(null, { status: 404 });

  const etag = `"${id}"`;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath(id, image.mime));
  } catch {
    console.error(`Note picture ${id} is in the database but not on disk`);
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': image.mime,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
    },
  });
}
