import { NextRequest } from 'next/server';
import { itemInLink, openLink, REFUSAL_STATUS } from '@/modules/files/lib/link-access';
import { servePreview } from '@/modules/files/lib/serve';
import { parseId } from '@/lib/validate';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const opened = await openLink(token);
  if ('refusal' in opened) return new Response(null, { status: REFUSAL_STATUS[opened.refusal] });
  const item = await itemInLink(opened.link, parseId(id));
  if (!item) return new Response(null, { status: 404 });
  return servePreview(request, item);
}
