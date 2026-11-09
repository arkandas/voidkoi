import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { toToolError } from '@/modules/utilikit/lib/tool-error';
import { authorize, RATE_LIMITS } from '@/modules/utilikit/lib/job-routes';
import { fetchMediaInfo, parseMediaUrl, resolvesPublicly } from '@/modules/utilikit/lib/ytdlp';

const STATUS: Record<string, number> = { toolMissing: 500, fetchFailed: 502, parseFailed: 502 };

export async function POST(request: NextRequest) {
  const { response } = await authorize(request, 'media', 'video-info', RATE_LIMITS.light);
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body?.url) return apiError('noUrl', 400);

  const url = parseMediaUrl(body.url);
  if (!url) return apiError('unsupportedUrl', 400);
  if (!(await resolvesPublicly(url))) return apiError('urlNotAllowed', 400);

  try {
    return NextResponse.json(await fetchMediaInfo(url));
  } catch (error) {
    const { code, detail } = toToolError(error, 'fetchFailed');
    if (STATUS[code]) console.error('Video info error:', detail);
    return NextResponse.json({ error: code, detail }, { status: STATUS[code] ?? 422 });
  }
}
