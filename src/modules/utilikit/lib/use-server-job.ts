'use client';

import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { downloadFilename } from '@/modules/utilikit/lib/download-filename';
import { readErrorCode } from '@/modules/utilikit/lib/api-error';

const POLL_INTERVAL = 700;
const FILE_LIFETIME = 5 * 60 * 1000;

export type JobResult = Record<string, string | number | boolean | null | undefined>;

export type ServerJob =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; progress: number }
  | { status: 'completed'; result: JobResult; expiresAt: number }
  | { status: 'failed'; error: string; detail?: string; result: JobResult };

interface StatusResponse extends JobResult {
  status?: 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  detail?: string;
}

async function fetchStatus(api: string, jobId: string): Promise<StatusResponse | null> {
  try {
    const response = await fetch(`${api}?jobId=${encodeURIComponent(jobId)}`);
    return response.ok ? await response.json() : { status: 'failed', error: await readErrorCode(response) };
  } catch (error) {
    console.error('Status check error:', error);
    return null;
  }
}

export function useServerJob(api: string) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ServerJob>({ status: 'idle' });
  const [now, setNow] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const secondsLeft = job.status === 'completed' ? Math.max(0, Math.ceil((job.expiresAt - now) / 1000)) : 0;
  const available = secondsLeft > 0;

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const response = await fetchStatus(api, jobId);
      if (!active) return;

      const { status, progress, error, detail, ...result } = response ?? {};
      if (status === 'completed') {
        const completedAt = Date.now();
        setNow(completedAt);
        setJob({ status: 'completed', result, expiresAt: completedAt + FILE_LIFETIME });
      } else if (status === 'failed') {
        setJob({ status: 'failed', error: error ?? 'generic', detail, result });
      } else {
        if (status) setJob({ status: 'processing', progress: progress ?? 0 });
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, jobId]);

  useEffect(() => {
    if (!available) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [available]);

  const start = async (body: FormData | Record<string, unknown>) => {
    const upload = body instanceof FormData;
    setJob(upload ? { status: 'uploading' } : { status: 'processing', progress: 0 });
    setSaveError(null);

    try {
      const response = await fetch(
        api,
        upload
          ? { method: 'POST', body }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );

      if (!response.ok) {
        setJob({ status: 'failed', error: await readErrorCode(response), result: {} });
        return;
      }

      const data: { jobId: string } = await response.json();
      setJob({ status: 'processing', progress: 0 });
      setJobId(data.jobId);
    } catch (error) {
      console.error('Job start error:', error);
      setJob({ status: 'failed', error: upload ? 'uploadFailed' : 'generic', result: {} });
    }
  };

  const save = async (fallback: string) => {
    if (!jobId || job.status !== 'completed') return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${api}/download?jobId=${encodeURIComponent(jobId)}`);

      if (!response.ok) {
        setSaveError(await readErrorCode(response));
        return;
      }

      saveAs(await response.blob(), downloadFilename(response.headers.get('Content-Disposition'), fallback));
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('downloadFailed');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setJob({ status: 'idle' });
    setSaveError(null);
  };

  return { job, secondsLeft, available, saving, saveError, start, save, reset };
}
