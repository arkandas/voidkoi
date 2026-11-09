import { NextRequest } from 'next/server';
import { itemInLink, openLink, REFUSAL_STATUS } from '@/modules/files/lib/link-access';
import { streamResponse } from '@/modules/files/lib/play';
import { parseId } from '@/lib/validate';

/**
 * A video or audio file in a link, converted as it plays. Like any preview, it
 * doesn't count as a download. Links hold only some of the streams at a time.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const opened = await openLink(token);
  if ('refusal' in opened) return new Response(null, { status: REFUSAL_STATUS[opened.refusal] });
  const item = await itemInLink(opened.link, parseId(id));
  if (!item) return new Response(null, { status: 404 });
  return streamResponse(request, item, true);
}
