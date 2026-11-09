import { spawnSync } from 'child_process';
import { readdir } from 'fs/promises';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as convertAudio } from '@/app/api/utilikit/audio-convert/route';
import { POST as readAudioMetadata } from '@/app/api/utilikit/audio-metadata/route';
import { POST as convertDocument } from '@/app/api/utilikit/document-convert/route';
import { POST as runPdfTools } from '@/app/api/utilikit/pdf-tools/route';
import { POST as convertVideo } from '@/app/api/utilikit/video-convert/route';
import { DOCUMENT_SIZE_LIMIT } from '@/modules/utilikit/lib/document-formats';
import { createJob, failJob, getJob, removeJobsOf, runningJobsOf } from '@/modules/utilikit/lib/jobs';
import { MAX_PDF_UPLOAD } from '@/modules/utilikit/lib/pdf-pages';
import { getTempDir } from '@/modules/utilikit/lib/temp';

/**
 * The converters take the file as the request's whole body and write it to
 * disk as it arrives, never past their limit, and every upload is a job of
 * the account from the moment it starts.
 */

const auth = vi.hoisted(() => ({ user: { id: 1000, apps: ['utilikit'] } }));

vi.mock('@/lib/session', () => ({ requireUser: async () => auth.user }));

const MB = 1024 * 1024;
const hasFfprobe = spawnSync('ffprobe', ['-version']).status === 0;

type Route = (request: NextRequest) => Promise<Response>;

const upload = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', body, headers });

/** What the converters leave in the temp folder, by the names they give it. (`pdf-` folders are pdf-tools.test.ts's too.) */
const leftovers = async () =>
  (await readdir(getTempDir()).catch(() => [] as string[])).filter(name => /^(audio-|video-|doc-|metadata-)/.test(name)).sort();

/** A second of silence as a 16-bit PCM WAV file. */
function wav(seconds = 1, rate = 8000): Buffer {
  const bytes = Math.round(seconds * rate) * 2;
  const file = Buffer.alloc(44 + bytes);
  file.write('RIFF', 0);
  file.writeUInt32LE(36 + bytes, 4);
  file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write('data', 36);
  file.writeUInt32LE(bytes, 40);
  return file;
}

let before: string[] = [];

beforeEach(async () => {
  auth.user = { id: auth.user.id + 1, apps: ['utilikit'] };
  before = await leftovers();
});

afterEach(async () => {
  // Jobs that were let through finish in the background: wait, then remove them with their files.
  const userId = auth.user.id;
  await vi.waitFor(() => expect(runningJobsOf(userId)).toBe(0), { timeout: 15_000, interval: 50 });
  await removeJobsOf(userId);
});

const LIMITS: Array<[string, Route, number, string]> = [
  ['audio-convert', convertAudio, 500 * MB, 'name=song.mp3&format=mp3'],
  ['audio-metadata', readAudioMetadata, 500 * MB, 'name=song.mp3'],
  ['video-convert', convertVideo, 2048 * MB, 'name=clip.mp4&format=mp4-h264'],
  ['document-convert', convertDocument, DOCUMENT_SIZE_LIMIT, 'name=notes.md&inputFormat=markdown&outputFormat=html'],
];

describe('uploads', () => {
  it.each(LIMITS)('%s refuses a file over its limit before reading it, and leaves nothing behind', async (name, route, limit, query) => {
    const response = await route(upload(`/api/utilikit/${name}?${query}`, 'x', { 'content-length': String(limit + 1) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'fileTooLarge' });
    expect(runningJobsOf(auth.user.id)).toBe(0);
    expect(await leftovers()).toEqual(before);
  });

  it.each(LIMITS)('%s takes a file up to its limit', async (name, route, limit, query) => {
    const response = await route(upload(`/api/utilikit/${name}?${query}`, '# Hi', { 'content-length': String(limit) }));
    expect(await response.json()).not.toEqual({ error: 'fileTooLarge' });
  });

  it('refuses a PDF form over the total limit before reading it', async () => {
    const response = await runPdfTools(
      upload('/api/utilikit/pdf-tools', 'x', { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_PDF_UPLOAD + 2 * MB) }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'fileTooLarge' });
    expect(runningJobsOf(auth.user.id)).toBe(0);
  });

  it('reads the PDF form from the bounded body', async () => {
    const form = new FormData();
    form.append('mode', 'merge');
    form.append('file', new File(['%PDF-1.4'], 'one.pdf', { type: 'application/pdf' }));
    const response = await runPdfTools(new NextRequest('http://localhost/api/utilikit/pdf-tools', { method: 'POST', body: form }));
    expect(await response.json()).toEqual({ error: 'notEnoughFiles' });
  });

  it('answers noFile for an empty body', async () => {
    const response = await convertAudio(upload('/api/utilikit/audio-convert?name=song.mp3', ''));
    expect(await response.json()).toEqual({ error: 'noFile' });
    expect(await leftovers()).toEqual(before);
  });

  it.skipIf(!hasFfprobe)('streams the file to disk, reads it there and removes it', async () => {
    const response = await readAudioMetadata(upload('/api/utilikit/audio-metadata?name=silence.wav', new Uint8Array(wav()), { 'content-type': 'audio/wav' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duration: 1, bitrate: 128, codec: 'PCM_S16LE' });
    expect(await leftovers()).toEqual(before);
  });

  it('keeps the file’s name only for its extension', async () => {
    const response = await convertDocument(upload('/api/utilikit/document-convert?name=../../evil.md&outputFormat=html', '# Hi'));
    const { jobId } = await response.json();
    expect(getJob('document', jobId, auth.user.id)?.files.every(file => file.startsWith(getTempDir()))).toBe(true);
  });
});

describe('running jobs per account', () => {
  it('turns an upload away while the account has three jobs at work, before reading it', async () => {
    const busy = [createJob('video', auth.user.id), createJob('audio', auth.user.id), createJob('pdf', auth.user.id)];
    const response = await convertAudio(upload('/api/utilikit/audio-convert?name=song.wav&format=mp3', new Uint8Array(wav())));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rateLimited' });
    expect(await leftovers()).toEqual(before);
    for (const job of busy) failJob(job, null, 'conversionFailed');
  });

  it('counts an upload still arriving as one of them', async () => {
    let finish: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(wav()));
        finish = () => controller.close();
      },
    });
    const init = { method: 'POST', body, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1];
    const pending = convertAudio(new NextRequest('http://localhost/api/utilikit/audio-convert?name=a.wav', init));
    await vi.waitFor(() => expect(runningJobsOf(auth.user.id)).toBe(1));
    const busy = [createJob('video', auth.user.id), createJob('video', auth.user.id)];

    const refused = await convertVideo(upload('/api/utilikit/video-convert?name=b.mp4', 'x'));
    expect(await refused.json()).toEqual({ error: 'rateLimited' });

    finish();
    expect((await pending).status).toBe(200);
    for (const job of busy) failJob(job, null, 'conversionFailed');
  });
});
