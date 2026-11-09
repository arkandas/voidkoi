import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { apiError } from '@/lib/api-errors';
import { ToolError } from '@/modules/utilikit/lib/tool-error';
import { probeMedia, runFfmpeg } from '@/modules/utilikit/lib/ffmpeg';
import { authorize, jobStatus, RATE_LIMITS, receiveUpload, startJob } from '@/modules/utilikit/lib/job-routes';
import { completeJob, failJob, setData, setProgress, trackFiles } from '@/modules/utilikit/lib/jobs';
import { safeExtension, tempPath } from '@/modules/utilikit/lib/temp';
import { parseTrimFields } from '@/modules/utilikit/lib/time-range';
import { ownValue } from '@/modules/utilikit/lib/validate';
import { buildVideoArgs, GIF_FRAME_RATES, MAX_GIF_SECONDS, VIDEO_CODECS, VIDEO_PRESETS, VideoPreset } from '@/modules/utilikit/lib/video-convert';

const MAX_SIZE = 2 * 1024 * 1024 * 1024;

/** The video is the request's body; its name and the options are in the query string. */
export async function POST(request: NextRequest) {
  const { userId, response } = await authorize(request, 'media', 'video-convert', RATE_LIMITS.converter);
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const codec = ownValue(VIDEO_CODECS, params.get('format') ?? 'mp4-h264');
  if (!codec) return apiError('invalidFormat', 400);

  const preset = String(params.get('preset') ?? 'slower') as VideoPreset;
  const options = {
    quality: Math.min(Math.max(parseInt(String(params.get('quality'))) || 100, 10), 100),
    resolution: String(params.get('resolution') ?? 'original'),
    customWidth: parseInt(String(params.get('customWidth'))) || undefined,
    customHeight: parseInt(String(params.get('customHeight'))) || undefined,
    preset: VIDEO_PRESETS.includes(preset) ? preset : 'slower',
    keepAudio: params.get('keepAudio') !== 'false',
    gifFrameRate: GIF_FRAME_RATES.find(rate => String(rate) === params.get('gifFrameRate')) ?? 15,
  };
  const trimStart = params.get('trimStart');
  const trimEnd = params.get('trimEnd');

  const started = startJob('video', userId);
  if (started.response) return started.response;
  const { job } = started;
  const inputPath = await tempPath(`video-input-${job.id}.${safeExtension(params.get('name') ?? '', 'mp4')}`);
  const outputPath = await tempPath(`video-output-${job.id}.${codec.extension}`);
  trackFiles(job, inputPath, outputPath);

  const inputSize = await receiveUpload(request, inputPath, MAX_SIZE);
  if (inputSize instanceof Response) {
    failJob(job, null, 'uploadFailed');
    return inputSize;
  }
  setData(job, { inputSize });

  (async () => {
    const info = await probeMedia(inputPath);
    if (!info.video) throw new ToolError('invalidFormat', 'no video stream');

    const trimmed = parseTrimFields(trimStart, trimEnd, info.duration);
    if (!trimmed.ok) throw new ToolError('invalidTrim');
    const length = trimmed.trim?.duration ?? info.duration;
    if (codec.format === 'gif' && length > MAX_GIF_SECONDS) throw new ToolError('gifTooLong', `${Math.round(length)} s`);

    const args = buildVideoArgs(inputPath, outputPath, codec, info, { ...options, trim: trimmed.trim });
    await runFfmpeg(args, length, percent => setProgress(job, percent));
    completeJob(job, outputPath, { outputSize: (await stat(outputPath)).size });
  })().catch(error => {
    console.error('Video conversion error:', error);
    failJob(job, error, 'conversionFailed');
  });

  return NextResponse.json({ jobId: job.id, status: job.status });
}

export function GET(request: NextRequest) {
  return jobStatus(request, 'video');
}
