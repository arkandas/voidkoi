import { randomUUID } from 'crypto'
import type { ApiErrorCode } from '@/lib/error-codes'
import { removeFiles } from '@/modules/utilikit/lib/temp'
import { toToolError, ToolError } from '@/modules/utilikit/lib/tool-error'

/**
 * The server-side tools' work: a conversion, a download or a PDF job runs in
 * the background while the page polls it. Jobs live in memory, belong to the
 * account that started them, and are forgotten, with their files, five
 * minutes after they end.
 */

export const JOB_RETENTION_MS = 5 * 60 * 1000

export type JobKind = 'video' | 'audio' | 'document' | 'download' | 'pdf'
export type JobStatus = 'processing' | 'completed' | 'failed'
export type JobData = Record<string, string | number | boolean | undefined>

export interface Job {
  id: string
  kind: JobKind
  userId: number
  status: JobStatus
  progress: number
  error?: ApiErrorCode
  detail?: string
  outputPath?: string
  files: string[]
  data: JobData
}

const globalForJobs = globalThis as unknown as { utilikitJobs?: Map<string, Job> }
const jobs = (globalForJobs.utilikitJobs ??= new Map<string, Job>())

function scheduleRemoval(job: Job) {
  const timer = setTimeout(async () => {
    jobs.delete(job.id)
    await removeFiles(...job.files)
  }, JOB_RETENTION_MS)
  timer.unref?.()
}

export function createJob(kind: JobKind, userId: number, data: JobData = {}): Job {
  const job: Job = { id: randomUUID(), kind, userId, status: 'processing', progress: 0, files: [], data }
  jobs.set(job.id, job)
  return job
}

export function getJob(kind: JobKind, id: string, userId: number): Job | undefined {
  const job = jobs.get(id)
  return job && job.kind === kind && job.userId === userId ? job : undefined
}

export function trackFiles(job: Job, ...files: string[]) {
  job.files.push(...files)
}

export function setProgress(job: Job, progress: number) {
  if (job.status !== 'processing') return
  job.progress = Math.max(job.progress, Math.min(Math.round(progress), 99))
}

export function setData(job: Job, data: JobData) {
  Object.assign(job.data, data)
}

export function completeJob(job: Job, outputPath: string, data: JobData = {}) {
  job.status = 'completed'
  job.progress = 100
  job.outputPath = outputPath
  if (!job.files.includes(outputPath)) job.files.push(outputPath)
  Object.assign(job.data, data)
  scheduleRemoval(job)
}

export function failJob(job: Job, error: unknown, fallback: ApiErrorCode) {
  if (job.status !== 'processing') return
  const apiError = toToolError(error, fallback)
  job.status = 'failed'
  job.progress = 0
  job.error = apiError.code
  // Only a ToolError's detail, which is in our own words: other errors' messages can name server paths.
  job.detail = error instanceof ToolError ? error.detail?.slice(0, 500) : undefined
  void removeFiles(...job.files)
  job.files = []
  scheduleRemoval(job)
}

export function publicJob(job: Job) {
  return {
    ...job.data,
    status: job.status,
    progress: job.progress,
    error: job.error,
    detail: job.detail,
  }
}

/** How many jobs an account has at work, uploads still arriving included. */
export function runningJobsOf(userId: number): number {
  let count = 0
  for (const job of jobs.values()) if (job.userId === userId && job.status === 'processing') count++
  return count
}

/** The ids of the jobs still running, whose files must stay. */
export function runningJobIds(): string[] {
  return [...jobs.values()].filter(job => job.status === 'processing').map(job => job.id)
}

/** Forget an account's jobs and remove their files, when the account is deleted. */
export async function removeJobsOf(userId: number) {
  const owned = [...jobs.values()].filter(job => job.userId === userId)
  for (const job of owned) {
    jobs.delete(job.id)
    await removeFiles(...job.files)
  }
}

export function clearJobs() {
  jobs.clear()
}
