import { Readable } from 'node:stream';

import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { photoOf, removePhoto, setPhoto } from '@/modules/talk/backend/endpoints/groups';
import { idOf } from '@/modules/talk/backend/endpoints/http';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

type Params = { params: Promise<{ id: string }> };

/** The photo. Its URL names the photo (`?v=`), so a browser keeps each one for good. */
export async function GET(request: NextRequest, { params }: Params) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    const hub = await talkHub();
    const photo = await photoOf(hub, user.id, idOf((await params).id, 'groupNotFound'));
    const tag = `"group-photo-${photo.id}"`;
    if (request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers: { ETag: tag } });
    const versioned = request.nextUrl.searchParams.get('v') === photo.id;
    return new Response(Readable.toWeb(hub.files.store.open('group-photos', photo.id)) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': photo.type,
        'Content-Length': String(photo.size),
        ETag: tag,
        'Cache-Control': versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
}

/** A new photo, already cropped in the browser: `{ image }`, base64. The owner's to change. */
export async function PUT(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    limit('group-photo', user.id, 20, 10);
    const groupId = idOf((await params).id, 'groupNotFound');
    return NextResponse.json(await setPhoto(await talkHub(), user.id, groupId, (await readJson(request)) ?? {}));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    return NextResponse.json(await removePhoto(await talkHub(), user.id, idOf((await params).id, 'groupNotFound')));
  });
}
