import { NextRequest } from 'next/server';
import { visibleItem } from '@/modules/files/lib/items';
import { streamResponse } from '@/modules/files/lib/play';
import { currentUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

/** A video or audio file converted for the browser as it plays, from `?t=` seconds. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const access = await visibleItem(user.id, parseId((await params).id)).catch(() => null);
  if (!access) return new Response(null, { status: 404 });
  return streamResponse(request, access.item);
}
