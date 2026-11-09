import { NextRequest } from 'next/server';
import { serveAvatar } from '@/lib/avatars';
import { isToken } from '@/lib/ids';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/session';
import { findLink, linkState } from '@/modules/files/lib/shares';
import { findUploadLink, uploadLinkState } from '@/modules/files/lib/upload-links';
import { parseId } from '@/lib/validate';

/** Whether a visitor who isn't signed in came through a link of `ownerId`: a share link or an upload link. */
async function throughLink(request: NextRequest, ownerId: number): Promise<boolean> {
  const query = request.nextUrl.searchParams;
  const token = query.get('link');
  if (isToken(token)) {
    const link = await findLink(token);
    return !!link && linkState(link) === 'ok' && link.owner_id === ownerId;
  }
  const upload = await findUploadLink(query.get('upload') ?? '');
  return !!upload && uploadLinkState(upload) === 'ok' && upload.owner_id === ownerId;
}

/** Anyone signed in sees everyone's picture; a link's visitors see the picture of whose link it is. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return new Response(null, { status: 404 });
  if (!(await currentUser()) && !(await throughLink(request, id))) return new Response(null, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id }, select: { avatar_key: true } });
  return user ? serveAvatar(user) : new Response(null, { status: 404 });
}
