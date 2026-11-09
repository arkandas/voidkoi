import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { toToolError } from '@/modules/utilikit/lib/tool-error';
import { authorize, RATE_LIMITS } from '@/modules/utilikit/lib/job-routes';
import { parseOpenGraph } from '@/modules/utilikit/lib/og-parser';
import { fetchPublicText, parseHttpUrl } from '@/modules/utilikit/lib/safe-fetch';

const STATUS: Record<string, number> = { urlNotAllowed: 400, fetchFailed: 502 };

export async function POST(request: NextRequest) {
  const { response } = await authorize(request, 'web', 'og-parser', RATE_LIMITS.light);
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body?.url) return apiError('noUrl', 400);

  const url = parseHttpUrl(body.url);
  if (!url) return apiError('invalidUrl', 400);

  try {
    const html = await fetchPublicText(url, {
      'User-Agent': 'Mozilla/5.0 (compatible; voidkoi/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    });
    return NextResponse.json(parseOpenGraph(html));
  } catch (error) {
    console.error('Open Graph parser error:', error);
    const { code } = toToolError(error, 'parseFailed');
    return apiError(code, STATUS[code] ?? 500);
  }
}
