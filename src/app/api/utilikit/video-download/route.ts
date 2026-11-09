import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { apiError } from '@/lib/api-errors';
import { isExtractFormat } from '@/modules/utilikit/lib/audio-convert';
import { authorize, jobStatus, RATE_LIMITS, startJob } from '@/modules/utilikit/lib/job-routes';
import { completeJob, failJob, setProgress } from '@/modules/utilikit/lib/jobs';
import { tempPath } from '@/modules/utilikit/lib/temp';
import { downloadMedia, isVideoQuality, MAX_ITEMS, parseMediaUrl, removeDownloadFiles, resolvesPublicly } from '@/modules/utilikit/lib/ytdlp';

export async function POST(request: NextRequest) {
  const { userId, response } = await authorize(request, 'media', 'video-download', RATE_LIMITS.heavy);
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body?.url) return apiError('noUrl', 400);

  const url = parseMediaUrl(body.url);
  if (!url) return apiError('unsupportedUrl', 400);
  if (!(await resolvesPublicly(url))) return apiError('urlNotAllowed', 400);

  const item = Number.isInteger(body.item) && body.item >= 1 && body.item <= MAX_ITEMS ? body.item : undefined;
  const started = startJob('download', userId);
  if (started.response) return started.response;
  const { job } = started;
  const prefix = `download-${job.id}.`;

  downloadMedia(
    {
      url,
      item,
      audioOnly: body.audioOnly === true,
      audioFormat: isExtractFormat(body.audioFormat) ? body.audioFormat : 'mp3',
      quality: isVideoQuality(body.quality) ? body.quality : 'best',
      outputTemplate: await tempPath(`${prefix}%(ext)s`),
    },
    percent => setProgress(job, percent),
  )
    .then(async ({ filepath, title }) => {
      completeJob(job, filepath, { fileSize: (await stat(filepath)).size, title: title || 'video' });
    })
    .catch(async error => {
      console.error('Video download error:', error);
      failJob(job, error, 'downloadFailed');
      await removeDownloadFiles(prefix);
    });

  return NextResponse.json({ jobId: job.id, status: job.status });
}

export function GET(request: NextRequest) {
  return jobStatus(request, 'download');
}
