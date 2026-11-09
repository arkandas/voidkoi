import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { treeFor } from '@/modules/wiki/lib/tree';
import { wikiContext } from '@/modules/wiki/lib/wiki';

/** The folders and pages this reader sees, in reading order. */
export async function GET() {
  return handle('loadFailed', async () => {
    const { index, reader } = await wikiContext();
    return NextResponse.json(treeFor(index, reader));
  });
}
