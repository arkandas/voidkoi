import { NextRequest } from 'next/server';
import { serveImage } from '@/modules/wiki/lib/images';
import { isKey } from '@/lib/ids';
import { prisma } from '@/lib/prisma';
import { access } from '@/modules/wiki/lib/tree';
import { wikiContext } from '@/modules/wiki/lib/wiki';

const missing = () => new Response(null, { status: 404 });

/**
 * A page's picture, for whoever may read a page that shows it: editors always,
 * readers through the published pages that show it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isKey(key)) return missing();
  const image = await prisma.wikiImage.findUnique({ where: { key }, include: { pages: { select: { page_id: true } } } });
  if (!image) return missing();

  const { index, reader } = await wikiContext();
  if (reader.editor) return serveImage(image);

  const pages = image.pages.map(page => index.byId.get(page.page_id)).filter(entry => entry !== undefined);
  if (pages.some(entry => access(entry, reader) === 'ok')) return serveImage(image);
  return missing();
}
