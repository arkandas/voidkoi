import { NextRequest, NextResponse } from 'next/server';
import type { PublicShare } from '@/modules/files/lib/api-types';
import { handle } from '@/lib/api-errors';
import { crumbsOf, describe, toPerson } from '@/modules/files/lib/items';
import { itemInLink, openLink } from '@/modules/files/lib/link-access';
import { prisma } from '@/lib/prisma';
import { parseId } from '@/lib/validate';

/** What a link shows: the file, or the contents of the shared folder (or of `?folder` inside it). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('loadFailed', async () => {
    const opened = await openLink((await params).token);
    if ('refusal' in opened) {
      const { refusal, link } = opened;
      const body: PublicShare = refusal === 'signIn' || refusal === 'password'
        ? { state: refusal, owner: link!.owner.username }
        : { state: refusal };
      return NextResponse.json(body);
    }

    const { link } = opened;
    const [root] = await describe([link.item], false);
    let body: PublicShare = {
      state: 'ok',
      owner: toPerson(link.owner),
      expiresAt: link.expires_at?.toISOString() ?? null,
      root: root!,
      folder: null,
      crumbs: [],
      items: [],
    };

    if (link.item.kind === 'FOLDER') {
      const asked = request.nextUrl.searchParams.get('folder');
      const folder = await itemInLink(link, asked === null ? null : parseId(asked));
      if (!folder || folder.kind !== 'FOLDER') return NextResponse.json({ state: 'notFound' } satisfies PublicShare);
      const children = await prisma.item.findMany({ where: { parent_id: folder.id, trashed_at: null } });
      const [described] = await describe([folder], false);
      body = { ...body, folder: described!, crumbs: await crumbsOf(folder.id, link.item_id), items: await describe(children, false) };
    }

    return NextResponse.json(body);
  });
}
