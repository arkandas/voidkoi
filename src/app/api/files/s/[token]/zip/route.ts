import { NextRequest } from 'next/server';
import { itemInLink, openLink, REFUSAL_STATUS } from '@/modules/files/lib/link-access';
import { countDownload } from '@/modules/files/lib/shares';
import { parseId } from '@/lib/validate';
import { zipEntries, zipResponse } from '@/modules/files/lib/zip';

/** A shared folder, or a folder inside it (`?folder`), as one zip. Each one counts as a download. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const opened = await openLink((await params).token);
  if ('refusal' in opened) return new Response(null, { status: REFUSAL_STATUS[opened.refusal] });

  const asked = request.nextUrl.searchParams.get('folder');
  const folder = await itemInLink(opened.link, asked === null ? null : parseId(asked));
  if (!folder || folder.kind !== 'FOLDER') return new Response(null, { status: 404 });

  // A HEAD only asks about the zip: it never uses up a download.
  if (request.method !== 'HEAD' && !(await countDownload(opened.link.id))) return new Response(null, { status: 410 });
  return zipResponse(await zipEntries([folder.id]), `${folder.name}.zip`);
}
