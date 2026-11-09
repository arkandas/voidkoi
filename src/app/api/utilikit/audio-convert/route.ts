import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { apiError } from '@/lib/api-errors';
import { ToolError } from '@/modules/utilikit/lib/tool-error';
import { AUDIO_FORMATS, buildAudioArgs, buildLoudnessProbeArgs, parseLoudness } from '@/modules/utilikit/lib/audio-convert';
import { probeMedia, runFfmpeg } from '@/modules/utilikit/lib/ffmpeg';
import { authorize, jobStatus, RATE_LIMITS, receiveUpload, startJob } from '@/modules/utilikit/lib/job-routes';
import { completeJob, failJob, setData, setProgress, trackFiles } from '@/modules/utilikit/lib/jobs';
import { safeExtension, tempPath } from '@/modules/utilikit/lib/temp';
import { parseTrimFields } from '@/modules/utilikit/lib/time-range';
import { ownValue } from '@/modules/utilikit/lib/validate';

const MAX_SIZE = 500 * 1024 * 1024;

/** The audio is the request's body; its name and the options are in the query string. */
export async function POST(request: NextRequest) {
  const { userId, response } = await authorize(request, 'media', 'audio-convert', RATE_LIMITS.converter);
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const format = ownValue(AUDIO_FORMATS, params.get('format') ?? 'mp3');
  if (!format) return apiError('invalidFormat', 400);

  const requestedBitrate = parseInt(String(params.get('bitrate'))) || 192;
  const matchSource = params.get('matchSourceBitrate') === 'true';
  const normalize = params.get('normalize') === 'true';
  const trimStart = params.get('trimStart');
  const trimEnd = params.get('trimEnd');

  const started = startJob('audio', userId);
  if (started.response) return started.response;
  const { job } = started;
  const inputPath = await tempPath(`audio-input-${job.id}.${safeExtension(params.get('name') ?? '', 'mp3')}`);
  const outputPath = await tempPath(`audio-output-${job.id}.${format.extension}`);
  trackFiles(job, inputPath, outputPath);

  const inputSize = await receiveUpload(request, inputPath, MAX_SIZE);
  if (inputSize instanceof Response) {
    failJob(job, null, 'uploadFailed');
    return inputSize;
  }
  setData(job, { inputSize });

  (async () => {
    const info = await probeMedia(inputPath);
    if (!info.audio) throw new ToolError('noAudioTrack');

    const trimmed = parseTrimFields(trimStart, trimEnd, info.duration);
    if (!trimmed.ok) throw new ToolError('invalidTrim');
    const length = trimmed.trim?.duration ?? info.duration;
    const bitrate = matchSource ? info.audio.bitrate / 1000 : requestedBitrate;

    let loudness = null;
    if (normalize) {
      const measurement = await runFfmpeg(buildLoudnessProbeArgs(inputPath, trimmed.trim), length, percent =>
        setProgress(job, percent / 2),
      );
      loudness = parseLoudness(measurement);
      if (!loudness) throw new ToolError('conversionFailed', 'The loudness could not be measured');
    }

    const args = buildAudioArgs(inputPath, outputPath, format, {
      bitrate,
      trim: trimmed.trim,
      loudness,
      sampleRate: info.audio.sampleRate,
    });
    await runFfmpeg(args, length, percent => setProgress(job, normalize ? 50 + percent / 2 : percent));
    completeJob(job, outputPath, { outputSize: (await stat(outputPath)).size, duration: length });
  })().catch(error => {
    console.error('Audio conversion error:', error);
    failJob(job, error, 'conversionFailed');
  });

  return NextResponse.json({ jobId: job.id, status: job.status });
}

export function GET(request: NextRequest) {
  return jobStatus(request, 'audio');
}
