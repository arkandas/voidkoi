import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { toToolError } from '@/modules/utilikit/lib/tool-error';
import { fetchServerCertificates, parsePem, parseServer, summarize } from '@/modules/utilikit/lib/certificate';
import { authorize, RATE_LIMITS } from '@/modules/utilikit/lib/job-routes';

const MAX_PEM_LENGTH = 200_000;

export async function POST(request: NextRequest) {
  const { response } = await authorize(request, 'network', 'certificate', RATE_LIMITS.light);
  if (response) return response;

  const body = await request.json().catch(() => null);

  try {
    if (body?.mode === 'server') {
      const server = parseServer(body.host, body.port);
      if (!server) return apiError('invalidHost', 400);
      return NextResponse.json(await fetchServerCertificates(server.host, server.port));
    }

    if (typeof body?.pem !== 'string' || !body.pem.trim() || body.pem.length > MAX_PEM_LENGTH) {
      return apiError('certificateInvalid', 400);
    }
    return NextResponse.json({ certificates: parsePem(body.pem).map(certificate => summarize(certificate)) });
  } catch (error) {
    const { code, detail } = toToolError(error, 'connectionFailed');
    if (code === 'connectionFailed') console.error('Certificate check error:', detail);
    return NextResponse.json({ error: code, detail }, { status: code === 'connectionFailed' ? 502 : 400 });
  }
}
