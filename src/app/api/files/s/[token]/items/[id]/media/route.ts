import { NextRequest } from 'next/server';
import { itemInLink, openLink, REFUSAL_STATUS } from '@/modules/files/lib/link-access';
import { mediaResponse } from '@/modules/files/lib/play';
import { parseId } from '@/lib/validate';

/** What the player needs to know about a video or audio file in a link. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const opened = await openLink(token);
  if ('refusal' in opened) return new Response(null, { status: REFUSAL_STATUS[opened.refusal] });
  const item = await itemInLink(opened.link, parseId(id));
  if (!item) return new Response(null, { status: 404 });
  return mediaResponse(item);
}
