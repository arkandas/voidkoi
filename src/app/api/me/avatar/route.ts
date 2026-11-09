import { NextRequest, NextResponse } from 'next/server';
import { describeMe } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { clearAvatar, setAvatar } from '@/lib/avatars';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';

export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    if (typeof body?.image !== 'string') return apiError('invalidImage', 400);
    return NextResponse.json(await describeMe(await setAvatar(user, body.image)));
  });
}

export async function DELETE() {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    return NextResponse.json(await describeMe(await clearAvatar(user)));
  });
}
