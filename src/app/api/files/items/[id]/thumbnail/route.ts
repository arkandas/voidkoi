import { NextRequest } from 'next/server';
import { visibleItem } from '@/modules/files/lib/items';
import { serveThumbnail } from '@/modules/files/lib/serve';
import { currentUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const access = await visibleItem(user.id, parseId((await params).id)).catch(() => null);
  if (!access) return new Response(null, { status: 404 });
  return serveThumbnail(request, access.item);
}
