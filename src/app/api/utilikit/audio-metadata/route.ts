import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { apiError } from '@/lib/api-errors';
import { toToolError } from '@/modules/utilikit/lib/tool-error';
import { probeMedia } from '@/modules/utilikit/lib/ffmpeg';
import { authorize, RATE_LIMITS, receiveUpload } from '@/modules/utilikit/lib/job-routes';
import { removeFiles, safeExtension, tempPath } from '@/modules/utilikit/lib/temp';

const MAX_SIZE = 500 * 1024 * 1024;

/** The audio is the request's body; its name is in the query string. */
export async function POST(request: NextRequest) {
  const { response } = await authorize(request, 'media', 'audio-metadata', RATE_LIMITS.light);
  if (response) return response;

  let inputPath: string | null = null;

  try {
    inputPath = await tempPath(`metadata-${randomUUID()}.${safeExtension(request.nextUrl.searchParams.get('name') ?? '', 'tmp')}`);
    const size = await receiveUpload(request, inputPath, MAX_SIZE);
    if (size instanceof Response) return size;

    const info = await probeMedia(inputPath);
    if (!info.audio) return apiError('noAudioTrack', 400);

    return NextResponse.json({
      duration: info.duration,
      bitrate: Math.round(info.audio.bitrate / 1000),
      codec: info.audio.codec.toUpperCase(),
    });
  } catch (error) {
    console.error('Audio metadata error:', error);
    return apiError(toToolError(error, 'metadataFailed').code, 500);
  } finally {
    await removeFiles(inputPath);
  }
}
