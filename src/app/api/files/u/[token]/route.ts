import { NextRequest, NextResponse } from 'next/server';
import type { PublicUploadLink } from '@/modules/files/lib/api-types';
import { handle } from '@/lib/api-errors';
import { toPerson } from '@/modules/files/lib/items';
import { getSettings } from '@/modules/files/lib/settings';
import { openUploadLink } from '@/modules/files/lib/upload-links';
import { CHUNK_SIZE } from '@/modules/files/lib/uploads';

/** What an upload link shows: who files go to, and the name of their folder. Never what is in it. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('loadFailed', async () => {
    const opened = await openUploadLink((await params).token);
    if ('refusal' in opened) {
      const { refusal, link } = opened;
      const body: PublicUploadLink = refusal === 'password' ? { state: 'password', owner: link!.owner.username } : { state: refusal };
      return NextResponse.json(body);
    }
    const { link } = opened;
    const body: PublicUploadLink = {
      state: 'ok',
      owner: toPerson(link.owner),
      folder: link.folder.name,
      expiresAt: link.expires_at?.toISOString() ?? null,
      maxUploadBytes: (await getSettings()).maxUploadBytes,
      chunkSize: CHUNK_SIZE,
    };
    return NextResponse.json(body);
  });
}
