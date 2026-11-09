import { NextRequest } from 'next/server';
import { visibleItem } from '@/modules/files/lib/items';
import { mediaResponse } from '@/modules/files/lib/play';
import { currentUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

/** What the player needs to know about a video or audio file before playing it. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const access = await visibleItem(user.id, parseId((await params).id)).catch(() => null);
  if (!access) return new Response(null, { status: 404 });
  return mediaResponse(access.item);
}
