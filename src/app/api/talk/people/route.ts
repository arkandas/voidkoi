import { NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { people } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

/** Everyone else who uses Talk, with whether they have it open. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    return NextResponse.json(await people(await talkHub(), user.id));
  });
}
