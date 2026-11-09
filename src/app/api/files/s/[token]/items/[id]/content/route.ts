import { NextRequest } from 'next/server';
import { itemInLink, openLink, REFUSAL_STATUS } from '@/modules/files/lib/link-access';
import { countsAsDownload, serveFile } from '@/modules/files/lib/serve';
import { countDownload } from '@/modules/files/lib/shares';
import { parseId } from '@/lib/validate';

/**
 * A file through a link. A download counts toward the link's limit and goes
 * out whole: one asked for with `?download`, or a file the page can't show.
 * A preview doesn't count.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const opened = await openLink(token);
  if ('refusal' in opened) return new Response(null, { status: REFUSAL_STATUS[opened.refusal] });

  const item = await itemInLink(opened.link, parseId(id));
  if (!item || item.kind !== 'FILE') return new Response(null, { status: 404 });

  const download = countsAsDownload(item, request.nextUrl.searchParams.has('download'));
  // A HEAD only asks about the file: it never uses up a download.
  if (download && request.method !== 'HEAD' && !(await countDownload(opened.link.id))) return new Response(null, { status: 410 });
  return serveFile(request, item, { download, whole: download });
}
