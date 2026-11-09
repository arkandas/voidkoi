import { readFile, stat, writeFile } from 'fs/promises';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJobs, completeJob, createJob, failJob } from '@/modules/utilikit/lib/jobs';
import { authorize, jobDownload, jobStatus, MAX_RUNNING_JOBS, receiveUpload, startJob } from '@/modules/utilikit/lib/job-routes';
import { removeFiles, tempPath } from '@/modules/utilikit/lib/temp';

const auth = vi.hoisted(() => ({ user: null as { id: number; apps: string[] } | null }));

vi.mock('@/lib/session', async () => {
  const { ApiError } = await import('@/lib/error-codes');
  return {
    requireUser: async () => {
      if (!auth.user) throw new ApiError('unauthorized', 401);
      return auth.user;
    },
  };
});

const EVERYTHING = ['utilikit'];
const request = (path: string) => new NextRequest(`http://localhost${path}`);
const MIME = { '.mp4': 'video/mp4' };
let scope = 0;

beforeEach(() => {
  auth.user = { id: 1, apps: EVERYTHING };
  clearJobs();
  scope++;
});

describe('authorize', () => {
  it('rejects anonymous requests', async () => {
    auth.user = null;
    const { response } = await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, { maxRequests: 5, windowMs: 60_000 });
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: 'unauthorized' });
  });

  it('turns away accounts that leave the tool’s category out', async () => {
    auth.user = { id: 1, apps: ['utilikit', '-utilikit.media'] };
    const { response } = await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, { maxRequests: 5, windowMs: 60_000 });
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: 'forbidden' });
  });

  it('rate limits per user', async () => {
    const limit = { maxRequests: 2, windowMs: 60_000 };
    expect((await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, limit)).userId).toBe(1);
    expect((await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, limit)).userId).toBe(1);

    const { response } = await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, limit);
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: 'rateLimited' });

    auth.user = { id: 2, apps: EVERYTHING };
    expect((await authorize(request('/api/utilikit/x'), 'media', `test-${scope}`, limit)).userId).toBe(2);
  });

  it('counts an account’s requests together, whatever address they come from', async () => {
    const limit = { maxRequests: 2, windowMs: 60_000 };
    const from = (address: string) => new NextRequest('http://localhost/api/utilikit/x', { headers: { 'x-voidkoi-client': address } });
    expect((await authorize(from('203.0.113.1'), 'media', `test-${scope}`, limit)).userId).toBe(1);
    expect((await authorize(from('203.0.113.2'), 'media', `test-${scope}`, limit)).userId).toBe(1);
    const { response } = await authorize(from('203.0.113.3'), 'media', `test-${scope}`, limit);
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: 'rateLimited' });
  });
});

describe('startJob', () => {
  it('lets an account have three jobs at work and turns a fourth away as rate limited', async () => {
    expect(MAX_RUNNING_JOBS).toBe(3);
    for (const kind of ['video', 'audio', 'pdf'] as const) expect(startJob(kind, 1).job?.kind).toBe(kind);

    const refused = startJob('document', 1);
    expect(refused.job).toBeUndefined();
    expect(refused.response?.status).toBe(429);
    expect(await refused.response?.json()).toEqual({ error: 'rateLimited' });

    expect(startJob('video', 2).job).toBeDefined();
  });

  it('frees a place when a job ends', () => {
    const [first] = [startJob('video', 1), startJob('video', 1), startJob('video', 1)].map(started => started.job!);
    expect(startJob('video', 1).response).toBeDefined();
    failJob(first, new Error('broken'), 'conversionFailed');
    expect(startJob('video', 1).job).toBeDefined();
  });
});

describe('receiveUpload', () => {
  /** A body that arrives in pieces, without a declared length. */
  const streamed = (parts: string[], headers: Record<string, string> = {}) =>
    new Request('http://localhost/x', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
          controller.close();
        },
      }),
      headers,
      duplex: 'half',
    } as RequestInit);
  const target = () => tempPath(`upload-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const gone = async (file: string) => expect(stat(file)).rejects.toThrow();

  it('writes the body to the file as it arrives and returns its size, up to the limit', async () => {
    const file = await target();
    expect(await receiveUpload(streamed(['12345', '678']), file, 8)).toBe(8);
    expect(await readFile(file, 'utf8')).toBe('12345678');
    await removeFiles(file);
  });

  it('refuses a declared length over the limit before reading it', async () => {
    const file = await target();
    const response = await receiveUpload(new Request('http://localhost/x', { method: 'POST', body: '123456789', headers: { 'content-length': '9' } }), file, 8);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
    expect(await (response as Response).json()).toEqual({ error: 'fileTooLarge' });
    await gone(file);
  });

  it('stops a body without a declared length once it passes the limit, and removes what it wrote', async () => {
    const file = await target();
    const response = await receiveUpload(streamed(['12345', '6789']), file, 8);
    expect(await (response as Response).json()).toEqual({ error: 'fileTooLarge' });
    await gone(file);
  });

  it('answers noFile for an empty body, and leaves nothing behind', async () => {
    const file = await target();
    expect(await ((await receiveUpload(streamed([]), file, 8)) as Response).json()).toEqual({ error: 'noFile' });
    await gone(file);
  });
});

describe('jobStatus', () => {
  it('requires a job id', async () => {
    const response = await jobStatus(request('/api/utilikit/video-convert'), 'video');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'jobIdRequired' });
  });

  it('returns the public job to its owner', async () => {
    const job = createJob('video', 1, { inputSize: 42 });
    const response = await jobStatus(request(`/api/utilikit/video-convert?jobId=${job.id}`), 'video');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inputSize: 42, status: 'processing', progress: 0 });
  });

  it("hides other users' jobs", async () => {
    const job = createJob('video', 2);
    const response = await jobStatus(request(`/api/utilikit/video-convert?jobId=${job.id}`), 'video');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'jobNotFound' });
  });

  it('rejects anonymous requests', async () => {
    auth.user = null;
    const job = createJob('video', 1);
    expect((await jobStatus(request(`/api/utilikit/video-convert?jobId=${job.id}`), 'video')).status).toBe(401);
  });
});

describe('jobDownload', () => {
  const download = (id: string) =>
    jobDownload(request(`/api/utilikit/video-convert/download?jobId=${id}`), 'video', MIME, (_, extension) => `canción${extension}`);

  it('streams the finished file with download headers', async () => {
    const output = await tempPath(`job-routes-${process.pid}-${Date.now()}.mp4`);
    await writeFile(output, 'video bytes');
    const job = createJob('video', 1);
    completeJob(job, output);

    const response = await download(job.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('Content-Length')).toBe('11');
    expect(response.headers.get('Content-Disposition')).toContain(`filename*=UTF-8''canci%C3%B3n.mp4`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('video bytes');

    await removeFiles(output);
  });

  it('reports unknown and foreign jobs as expired', async () => {
    expect((await download('missing')).status).toBe(410);
    const foreign = createJob('video', 2);
    const response = await download(foreign.id);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'fileExpired' });
  });

  it('refuses jobs that are still running', async () => {
    const job = createJob('video', 1);
    const response = await download(job.id);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'jobNotCompleted' });
  });

  it('reports a file that has already been removed as expired', async () => {
    const output = await tempPath(`job-routes-gone-${process.pid}-${Date.now()}.mp4`);
    await writeFile(output, 'x');
    const job = createJob('video', 1);
    completeJob(job, output);
    await removeFiles(output);

    expect((await download(job.id)).status).toBe(410);
  });
});
