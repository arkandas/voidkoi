import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { describeStatus } from '@/modules/files/lib/status';

export async function GET() {
  return handle('loadFailed', async () => NextResponse.json(await describeStatus(await requireUser())));
}
