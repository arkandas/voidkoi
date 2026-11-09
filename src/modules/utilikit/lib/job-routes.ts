import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@/generated/prisma/client'
import { apiError } from '@/lib/api-errors'
import { ApiError } from '@/lib/error-codes'
import { allow } from '@/lib/rate-limit'
import { BodyTooLarge, saveBody } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { uses } from '@/modules/registry'
import { contentDisposition } from '@/lib/http'
import { createJob, getJob, publicJob, runningJobsOf, type Job, type JobData, type JobKind } from '@/modules/utilikit/lib/jobs'
import { removeFiles } from '@/modules/utilikit/lib/temp'
import type { Category } from '@/modules/utilikit/lib/tools'

export interface RateLimit {
  maxRequests: number
  windowMs: number
}

export const RATE_LIMITS = {
  converter: { maxRequests: 10, windowMs: 60 * 1000 },
  heavy: { maxRequests: 5, windowMs: 60 * 1000 },
  light: { maxRequests: 30, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimit>

/** The most jobs an account may have at work at once, uploads still arriving included. */
export const MAX_RUNNING_JOBS = 3

/** The signed-in account, or the response that turns the request away. */
async function signedIn(): Promise<User | Response> {
  try {
    return await requireUser()
  } catch (error) {
    if (error instanceof ApiError) return apiError(error.code, error.status)
    throw error
  }
}

/**
 * A request to a tool that runs on the server: from an account that uses the
 * tool's category, and not more often than `limit` allows, per account
 * wherever it connects from.
 */
export async function authorize(request: NextRequest, category: Category, scope: string, limit: RateLimit) {
  const user = await signedIn()
  if (user instanceof Response) return { response: user }
  if (!uses(user.apps, 'utilikit', category)) return { response: apiError('forbidden', 403) }
  if (!allow(`utilikit:${scope}:${user.id}`, limit.maxRequests, limit.windowMs)) {
    return { response: apiError('rateLimited', 429) }
  }
  return { userId: user.id }
}

/** A new job for the account, or the response that turns it away while it has MAX_RUNNING_JOBS at work. */
export function startJob(kind: JobKind, userId: number, data?: JobData) {
  if (runningJobsOf(userId) >= MAX_RUNNING_JOBS) return { response: apiError('rateLimited', 429) }
  return { job: createJob(kind, userId, data) }
}

/**
 * The file a tool works on, sent as the request's whole body: written to
 * `file` as it arrives, never past `maxBytes`. Its size, or the response that
 * turns the upload away, which leaves nothing at `file`.
 */
export async function receiveUpload(request: Request, file: string, maxBytes: number): Promise<number | Response> {
  try {
    const size = await saveBody(request, file, maxBytes)
    if (size > 0) return size
    await removeFiles(file)
    return apiError('noFile', 400)
  } catch (error) {
    if (error instanceof BodyTooLarge) return apiError('fileTooLarge', 400)
    // Someone cancelling an upload isn't worth a line in the log.
    if (!request.signal.aborted && (error as NodeJS.ErrnoException | null)?.code !== 'ECONNRESET') console.error('Upload error:', error)
    return apiError('uploadFailed', 500)
  }
}

async function findJob(request: NextRequest, kind: JobKind) {
  const user = await signedIn()
  if (user instanceof Response) return { response: user }

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) return { response: apiError('jobIdRequired', 400) }

  return { job: getJob(kind, jobId, user.id) }
}

export async function jobStatus(request: NextRequest, kind: JobKind) {
  const { job, response } = await findJob(request, kind)
  if (response) return response
  if (!job) return apiError('jobNotFound', 404)
  return NextResponse.json(publicJob(job))
}

export async function jobDownload(
  request: NextRequest,
  kind: JobKind,
  mimeTypes: Record<string, string>,
  filename: (job: Job, extension: string) => string,
) {
  const { job, response } = await findJob(request, kind)
  if (response) return response
  if (!job) return apiError('fileExpired', 410)
  if (job.status !== 'completed' || !job.outputPath) return apiError('jobNotCompleted', 400)

  const size = await stat(job.outputPath).then(stats => stats.size).catch(() => null)
  if (size === null) return apiError('fileExpired', 410)

  const extension = path.extname(job.outputPath).toLowerCase()
  const body = Readable.toWeb(createReadStream(job.outputPath)) as ReadableStream<Uint8Array>

  return new Response(body, {
    headers: {
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
      'Content-Disposition': contentDisposition('attachment', filename(job, extension)),
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  })
}
