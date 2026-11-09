import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { callHistory, clearCalls } from '@/modules/talk/backend/endpoints/calls';
import { OK, pageLimit } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** The call log, newest first, with the missed calls not yet seen. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    const query = request.nextUrl.searchParams;
    const page = await callHistory(await talkHub(), user.id, {
      filter: query.get('filter'),
      before: query.get('before'),
      limit: pageLimit(query.get('limit')),
    });
    return NextResponse.json(page);
  });
}

/** Clear this person's whole log. */
export async function DELETE() {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await clearCalls(await talkHub(), user.id);
    return NextResponse.json(OK);
  });
}
