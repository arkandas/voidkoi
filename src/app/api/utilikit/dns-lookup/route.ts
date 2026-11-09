import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { isResolverId, lookupDns, normalizeQuery } from '@/modules/utilikit/lib/dns-lookup';
import { authorize, RATE_LIMITS } from '@/modules/utilikit/lib/job-routes';

export async function POST(request: NextRequest) {
  const { response } = await authorize(request, 'network', 'dns-lookup', RATE_LIMITS.light);
  if (response) return response;

  const body = await request.json().catch(() => null);
  const target = normalizeQuery(body?.query);
  if (!target) return apiError('invalidHost', 400);

  try {
    return NextResponse.json(await lookupDns(target, isResolverId(body?.resolver) ? body.resolver : 'cloudflare'));
  } catch (error) {
    console.error('DNS lookup error:', error);
    return apiError('lookupFailed', 502);
  }
}
