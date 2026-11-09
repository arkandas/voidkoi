import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { enabledApps } from '@/modules/registry';
import { SERVERS } from '@/modules/servers';

/** What is new in each app the account uses, for the counts on the rail. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const counts = await Promise.all(
      enabledApps(user.apps).map(async app => [app.id, (await SERVERS[app.id].badge?.(user.id).catch(() => 0)) ?? 0] as const),
    );
    return NextResponse.json(Object.fromEntries(counts.filter(([, count]) => count > 0)));
  });
}
