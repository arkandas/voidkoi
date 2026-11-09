import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJobs, completeJob, createJob, failJob, getJob, JOB_RETENTION_MS, publicJob, removeJobsOf, runningJobIds, setData, setProgress, trackFiles } from '@/modules/utilikit/lib/jobs';
import { removeFiles, tempPath } from '@/modules/utilikit/lib/temp';
import { ToolError } from '@/modules/utilikit/lib/tool-error';

const created: string[] = [];

const tempFile = async (name: string) => {
  const file = await tempPath(`jobs-test-${process.pid}-${Date.now()}-${name}`);
  await writeFile(file, name);
  created.push(file);
  return file;
};

beforeEach(() => clearJobs());
afterEach(() => vi.useRealTimers());
// Jobs that finish keep their files for minutes; the test run ends long before.
afterAll(() => removeFiles(...created));

describe('job lookup', () => {
  it('only returns a job to its owner and for its kind', () => {
    const job = createJob('video', 1);
    expect(getJob('video', job.id, 1)).toBe(job);
    expect(getJob('video', job.id, 2)).toBeUndefined();
    expect(getJob('audio', job.id, 1)).toBeUndefined();
    expect(getJob('video', 'missing', 1)).toBeUndefined();
  });

  it('uses unguessable ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createJob('audio', 1).id));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('setProgress', () => {
  it('rounds, caps at 99 and never goes backwards', () => {
    const job = createJob('video', 1);
    setProgress(job, 12.4);
    expect(job.progress).toBe(12);
    setProgress(job, 5);
    expect(job.progress).toBe(12);
    setProgress(job, 150);
    expect(job.progress).toBe(99);
  });

  it('ignores updates after the job has finished', async () => {
    const job = createJob('video', 1);
    completeJob(job, await tempFile('done.mp4'));
    setProgress(job, 50);
    expect(job.progress).toBe(100);
  });
});

describe('completeJob', () => {
  it('stores the result and removes every file after the retention period', async () => {
    vi.useFakeTimers();
    const job = createJob('video', 1, { inputSize: 10 });
    const input = await tempFile('input.mov');
    const output = await tempFile('output.mp4');
    trackFiles(job, input);

    completeJob(job, output, { outputSize: 5 });
    expect(publicJob(job)).toMatchObject({ status: 'completed', progress: 100, inputSize: 10, outputSize: 5 });

    await vi.advanceTimersByTimeAsync(JOB_RETENTION_MS - 1);
    expect(getJob('video', job.id, 1)).toBe(job);
    expect(existsSync(output)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(getJob('video', job.id, 1)).toBeUndefined();
    await vi.waitFor(() => {
      expect(existsSync(input)).toBe(false);
      expect(existsSync(output)).toBe(false);
    });
  });
});

describe('failJob', () => {
  it('records the error code, deletes the files at once and forgets the job later', async () => {
    vi.useFakeTimers();
    const job = createJob('audio', 1);
    const input = await tempFile('input.wav');
    trackFiles(job, input);

    failJob(job, new ToolError('noAudioTrack', 'no audio stream'), 'conversionFailed');
    expect(publicJob(job)).toMatchObject({ status: 'failed', progress: 0, error: 'noAudioTrack', detail: 'no audio stream' });
    await vi.waitFor(() => expect(existsSync(input)).toBe(false));

    await vi.advanceTimersByTimeAsync(JOB_RETENTION_MS);
    expect(getJob('audio', job.id, 1)).toBeUndefined();
  });

  it('uses the fallback code for unexpected errors, without their message', () => {
    const job = createJob('document', 1);
    failJob(job, new Error("ENOENT: no such file or directory, open '/data/utilikit/tmp/doc-output.pdf'"), 'conversionFailed');
    expect(job.error).toBe('conversionFailed');
    expect(job.detail).toBeUndefined();
  });

  it('shows what a program printed only in the log, and trims long details', () => {
    const job = createJob('video', 1);
    failJob(job, new ToolError('conversionFailed', 'ffmpeg exited with code 1', 400, '/data/utilikit/tmp/video-input.mp4: Invalid data'), 'conversionFailed');
    expect(publicJob(job)).toMatchObject({ error: 'conversionFailed', detail: 'ffmpeg exited with code 1' });
    expect(JSON.stringify(publicJob(job))).not.toContain('/data/');

    const long = createJob('video', 1);
    failJob(long, new ToolError('conversionFailed', 'x'.repeat(2000)), 'conversionFailed');
    expect(long.detail).toHaveLength(500);
  });

  it('does not overwrite a finished job', async () => {
    const job = createJob('document', 1);
    completeJob(job, await tempFile('out.pdf'));
    failJob(job, new Error('late'), 'conversionFailed');
    expect(job.status).toBe('completed');
  });
});

describe('publicJob', () => {
  it('never exposes server paths or the owner', async () => {
    const job = createJob('download', 7);
    setData(job, { title: 'Me at the zoo' });
    completeJob(job, await tempFile('video.mp4'), { fileSize: 1 });

    const exposed = publicJob(job);
    expect(exposed).toMatchObject({ title: 'Me at the zoo', fileSize: 1, status: 'completed' });
    expect(JSON.stringify(exposed)).not.toContain('jobs-test');
    expect(exposed).not.toHaveProperty('outputPath');
    expect(exposed).not.toHaveProperty('files');
    expect(exposed).not.toHaveProperty('userId');
  });
});

describe('runningJobIds', () => {
  it('lists only the jobs still at work', async () => {
    const running = createJob('video', 1);
    const done = createJob('video', 1);
    completeJob(done, await tempFile('finished.mp4'));
    expect(runningJobIds()).toEqual([running.id]);
  });
});

describe('removeJobsOf', () => {
  it('forgets an account’s jobs and removes their files, leaving other accounts alone', async () => {
    const mine = createJob('audio', 1);
    const input = await tempFile('mine.wav');
    trackFiles(mine, input);
    const theirs = createJob('audio', 2);

    await removeJobsOf(1);
    expect(getJob('audio', mine.id, 1)).toBeUndefined();
    expect(existsSync(input)).toBe(false);
    expect(getJob('audio', theirs.id, 2)).toBe(theirs);
  });
});
