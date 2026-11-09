import type { ItemDto, UploadSession } from '@/modules/files/lib/api-types'
import { ApiError, isApiErrorCode, readApiError, type ApiErrorCode } from '@/lib/error-codes'
import type { Picked } from './collect'
import { backoff, RateMeter } from './meter'

/**
 * Uploads, from dropped files to stored items.
 *
 * Small files go up in one request. Bigger ones are cut into pieces that go
 * up a few at a time; a piece that fails is sent again on its own, after a
 * pause that grows with each try, and losing the connection only pauses
 * things until it comes back. Files are taken in the order they were dropped,
 * so they also finish in that order.
 *
 * Framework-free: React reads it through `subscribe` and `getSnapshot`. The
 * app has one for the signed-in account; an upload link's page has its own,
 * which sends everything through the link.
 */

/** Requests in flight at once, across every file. */
const MAX_REQUESTS = 4

/** Tries per request before a file is given up on. Losing the connection doesn't count. */
const MAX_ATTEMPTS = 8

/** Until the server says otherwise. */
const DEFAULT_CHUNK = 8 * 1024 * 1024

/** No time-left estimate for this long after starting: the first seconds are all noise. */
const WARM_UP_MS = 1500

export type UploadStatus = 'waiting' | 'uploading' | 'paused' | 'done' | 'failed'

export interface UploadView {
  id: string
  name: string
  size: number
  type: string
  /** Where it goes, e.g. "My files / Photos". */
  destination: string
  status: UploadStatus
  sent: number
  /** Bytes per second, smoothed. */
  speed: number
  error: ApiErrorCode | null
  /** The stored file. Never known through an upload link, which doesn't tell. */
  item: ItemDto | null
}

export interface UploadTotals {
  count: number
  done: number
  failed: number
  paused: number
  /** Waiting or uploading. */
  active: number
  bytes: number
  sent: number
  speed: number
  /** Seconds left, or null while there is no fair estimate. */
  remaining: number | null
  startedAt: number | null
  finishedAt: number | null
  offline: boolean
}

export interface UploadSnapshot {
  uploads: UploadView[]
  totals: UploadTotals
}

export interface Target {
  /** The folder files go into: null for the top of My files, or for an upload link's own folder. */
  id: number | null
  label: string
}

interface Chunk {
  index: number
  start: number
  end: number
  state: 'pending' | 'sending' | 'done'
  loaded: number
  xhr: XMLHttpRequest | null
  attempts: number
  notBefore: number
}

interface Job {
  id: string
  file: File
  name: string
  dir: string
  target: Target
  destination: string
  /** Undefined until the folder it goes in exists. */
  parentId: number | null | undefined
  /** Takes the place of a file with the same name there, instead of sitting beside it. */
  replace: boolean
  status: UploadStatus
  session: UploadSession | null
  chunks: Chunk[]
  busy: 'starting' | 'completing' | null
  direct: XMLHttpRequest | null
  directLoaded: number
  attempts: number
  resets: number
  notBefore: number
  error: ApiErrorCode | null
  item: ItemDto | null
  meter: RateMeter
  speed: number
}

interface Failure {
  status: number
  code: ApiErrorCode | null
}

const EMPTY: UploadSnapshot = {
  uploads: [],
  totals: {
    count: 0, done: 0, failed: 0, paused: 0, active: 0, bytes: 0, sent: 0, speed: 0,
    remaining: null, startedAt: null, finishedAt: null, offline: false,
  },
}

/** A stored file from an upload's answer. An upload link answers without one. */
function storedItem(text: string): ItemDto | null {
  try {
    const body = JSON.parse(text)
    return body && typeof body.id === 'number' ? (body as ItemDto) : null
  } catch {
    return null
  }
}

function failureOf(xhr: XMLHttpRequest): Failure {
  let code: ApiErrorCode | null = null
  try {
    const body = JSON.parse(xhr.responseText)
    if (isApiErrorCode(body?.error)) code = body.error
  } catch {}
  return { status: xhr.status, code }
}

/** Worth sending again: the network, a proxy or the server having a bad moment. */
function retryable(failure: Failure): boolean {
  const { status, code } = failure
  return status === 0 || status === 408 || status === 429 || status >= 500 || code === 'chunkInvalid'
}

let sequence = 0

export class UploadManager {
  private jobs: Job[] = []
  private inflight = 0
  private listeners = new Set<() => void>()
  private uploadedListeners = new Set<(item: ItemDto) => void>()
  private folderListeners = new Set<(parentId: number | null) => void>()
  private snapshot: UploadSnapshot = EMPTY
  private emitTimer: ReturnType<typeof setTimeout> | null = null
  private wakeTimer: ReturnType<typeof setTimeout> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private meter = new RateMeter()
  private offline = false
  private directMax = DEFAULT_CHUNK
  private maxUploadBytes: number | null = null
  private batchStart: number | null = null
  private batchEnd: number | null = null

  /** `base`: where the upload routes are. "/api/files" in the app, "/api/files/u/<token>" through an upload link. */
  constructor(private readonly base = '/api/files') {
    if (typeof window === 'undefined') return
    this.offline = navigator.onLine === false
    window.addEventListener('online', () => {
      this.offline = false
      for (const job of this.jobs) {
        job.notBefore = 0
        for (const chunk of job.chunks) chunk.notBefore = 0
      }
      this.emit()
      this.pump()
    })
    window.addEventListener('offline', () => {
      this.offline = true
      this.emit()
    })
    window.addEventListener('beforeunload', event => {
      if (!this.jobs.some(job => job.status === 'waiting' || job.status === 'uploading' || job.status === 'paused')) return
      event.preventDefault()
      event.returnValue = ''
    })
  }

  setLimits(limits: { maxUploadBytes: number | null; directMax: number }): void {
    this.maxUploadBytes = limits.maxUploadBytes
    this.directMax = limits.directMax
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): UploadSnapshot => this.snapshot

  getServerSnapshot = (): UploadSnapshot => EMPTY

  /** Called with every file once it is stored. */
  onUploaded(listener: (item: ItemDto) => void): () => void {
    this.uploadedListeners.add(listener)
    return () => this.uploadedListeners.delete(listener)
  }

  /** Called when the folders of a dropped folder have been made. */
  onFolders(listener: (parentId: number | null) => void): () => void {
    this.folderListeners.add(listener)
    return () => this.folderListeners.delete(listener)
  }

  /**
   * Start uploading `picked` into `target`. With `replace`, files whose names
   * are taken there replace those files. Returns how many files were queued.
   */
  add(picked: Picked, target: Target, options: { replace?: boolean } = {}): number {
    if (!this.jobs.some(job => job.status !== 'done')) {
      this.jobs = []
      this.batchStart = null
      this.batchEnd = null
      this.meter.reset()
    }
    this.batchEnd = null

    for (const { file, dir } of picked.files) {
      const job: Job = {
        id: `u${++sequence}`,
        file,
        name: file.name,
        dir,
        target,
        destination: dir ? `${target.label} / ${dir.split('/').join(' / ')}` : target.label,
        parentId: dir ? undefined : target.id,
        replace: options.replace ?? false,
        status: 'waiting',
        session: null,
        chunks: [],
        busy: null,
        direct: null,
        directLoaded: 0,
        attempts: 0,
        resets: 0,
        notBefore: 0,
        error: null,
        item: null,
        meter: new RateMeter(2),
        speed: 0,
      }
      if (this.maxUploadBytes !== null && file.size > this.maxUploadBytes) {
        job.status = 'failed'
        job.error = 'fileTooLarge'
      }
      this.jobs.push(job)
    }

    if (picked.dirs.length > 0) void this.makeFolders(target, picked.dirs)
    this.emit()
    this.pump()
    return picked.files.length
  }

  pause(id: string): void {
    const job = this.find(id)
    if (!job || (job.status !== 'waiting' && job.status !== 'uploading')) return
    job.status = 'paused'
    this.abort(job)
    this.emit()
    this.pump()
  }

  resume(id: string): void {
    const job = this.find(id)
    if (!job || job.status !== 'paused') return
    job.status = job.session ? 'uploading' : 'waiting'
    job.notBefore = 0
    this.emit()
    this.pump()
  }

  retry(id: string): void {
    const job = this.find(id)
    if (!job || job.status !== 'failed' || job.error === 'fileTooLarge') return
    job.status = job.session ? 'uploading' : 'waiting'
    job.error = null
    job.attempts = 0
    job.notBefore = 0
    for (const chunk of job.chunks) {
      chunk.attempts = 0
      chunk.notBefore = 0
    }
    this.batchEnd = null
    this.emit()
    this.pump()
  }

  cancel(id: string): void {
    const job = this.find(id)
    if (!job) return
    this.abort(job)
    if (job.session && job.status !== 'done') {
      void fetch(`${this.base}/uploads/${job.session.id}`, { method: 'DELETE' }).catch(() => {})
    }
    this.jobs = this.jobs.filter(other => other !== job)
    this.settle()
    this.emit()
    this.pump()
  }

  pauseAll(): void {
    for (const job of this.jobs) if (job.status === 'waiting' || job.status === 'uploading') this.pause(job.id)
  }

  resumeAll(): void {
    for (const job of this.jobs) if (job.status === 'paused') this.resume(job.id)
  }

  cancelAll(): void {
    for (const job of [...this.jobs]) if (job.status !== 'done') this.cancel(job.id)
  }

  /** Take finished and failed uploads off the list. */
  clear(): void {
    this.jobs = this.jobs.filter(job => job.status !== 'done' && job.status !== 'failed')
    if (this.jobs.length === 0) {
      this.batchStart = null
      this.batchEnd = null
      this.meter.reset()
    }
    this.emit()
  }

  /* --- folders ---------------------------------------------------------- */

  /** The folder at `path` under `parentId`, made where missing. */
  private async ensurePath(parentId: number | null, path: string): Promise<{ folder: { id: number } | null }> {
    let response: Response
    try {
      response = await fetch(`${this.base}/folders/path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, path }),
      })
    } catch {
      throw new ApiError('saveFailed', 0)
    }
    if (!response.ok) throw await readApiError(response, 'saveFailed')
    return response.json()
  }

  private async makeFolders(target: Target, dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      let folderId: number | null | undefined
      for (let attempt = 1; attempt <= 4 && folderId === undefined; attempt++) {
        try {
          folderId = (await this.ensurePath(target.id, dir)).folder?.id ?? target.id
        } catch (error) {
          const fatal = error instanceof ApiError && error.status >= 400 && error.status < 500
          if (fatal || attempt === 4) break
          await new Promise(resolve => setTimeout(resolve, backoff(attempt)))
        }
      }
      for (const job of this.jobs) {
        if (job.target !== target || job.dir !== dir || job.parentId !== undefined) continue
        if (folderId === undefined) this.fail(job, 'uploadFailed')
        else job.parentId = folderId
      }
      this.emit()
      this.pump()
    }
    for (const listener of this.folderListeners) listener(target.id)
  }

  /* --- scheduling ------------------------------------------------------- */

  private find(id: string): Job | undefined {
    return this.jobs.find(job => job.id === id)
  }

  private pump(): void {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer)
      this.wakeTimer = null
    }
    if (this.offline) return
    const now = Date.now()
    let soonest = Infinity

    for (const job of this.jobs) {
      if (this.inflight >= MAX_REQUESTS) break
      if (job.status !== 'waiting' && job.status !== 'uploading') continue
      if (job.parentId === undefined || job.busy || job.direct) continue
      if (job.notBefore > now) {
        soonest = Math.min(soonest, job.notBefore)
        continue
      }

      if (job.status === 'waiting') {
        this.start(job)
        continue
      }
      if (!job.session) continue

      for (const chunk of job.chunks) {
        if (this.inflight >= MAX_REQUESTS) break
        if (chunk.state !== 'pending') continue
        if (chunk.notBefore > now) {
          soonest = Math.min(soonest, chunk.notBefore)
          continue
        }
        this.sendChunk(job, chunk)
      }
      if (job.chunks.every(chunk => chunk.state === 'done')) this.complete(job)
    }

    if (soonest !== Infinity) this.wakeTimer = setTimeout(() => this.pump(), soonest - now)
    this.tick()
  }

  private start(job: Job): void {
    job.status = 'uploading'
    this.batchStart ??= Date.now()
    if (job.file.size <= this.directMax) this.sendDirect(job)
    else this.openSession(job)
  }

  private sendDirect(job: Job): void {
    const xhr = new XMLHttpRequest()
    job.direct = xhr
    job.directLoaded = 0
    this.inflight += 1
    xhr.open('POST', `${this.base}/uploads/direct`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(job.name))
    xhr.setRequestHeader('X-File-Type', job.file.type)
    xhr.setRequestHeader('X-Parent-Id', job.parentId === null || job.parentId === undefined ? 'root' : String(job.parentId))
    if (job.replace) xhr.setRequestHeader('X-Replace', '1')
    xhr.upload.onprogress = event => {
      job.directLoaded = event.loaded
      this.emit()
    }
    xhr.onloadend = () => {
      this.inflight -= 1
      if (job.direct !== xhr) {
        // Aborted on purpose: paused, cancelled or started over.
        this.pump()
        return
      }
      job.direct = null
      if (xhr.status === 201) {
        this.finish(job, storedItem(xhr.responseText))
      } else {
        job.directLoaded = 0
        this.failed(job, failureOf(xhr), () => {
          job.status = 'waiting'
        })
      }
      this.emit()
      this.pump()
    }
    xhr.send(job.file)
  }

  private openSession(job: Job): void {
    job.busy = 'starting'
    this.inflight += 1
    fetch(`${this.base}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: job.name, size: job.file.size, type: job.file.type, parentId: job.parentId, replace: job.replace }),
    })
      .then(async response => {
        if (!response.ok) throw await this.responseFailure(response)
        const session = (await response.json()) as UploadSession
        job.session = session
        job.chunks = this.cut(job.file.size, session)
        job.attempts = 0
      })
      .catch(error => {
        const failure: Failure = isFailure(error) ? error : { status: 0, code: null }
        this.failed(job, failure, () => {
          job.status = 'waiting'
        })
      })
      .finally(() => {
        this.inflight -= 1
        job.busy = null
        this.emit()
        this.pump()
      })
  }

  private cut(size: number, session: UploadSession): Chunk[] {
    const received = new Set(session.received)
    const count = Math.max(1, Math.ceil(size / session.chunkSize))
    return Array.from({ length: count }, (_, index) => {
      const start = index * session.chunkSize
      const end = Math.min(size, start + session.chunkSize)
      const done = received.has(index)
      return { index, start, end, state: done ? 'done' : 'pending', loaded: done ? end - start : 0, xhr: null, attempts: 0, notBefore: 0 }
    })
  }

  private sendChunk(job: Job, chunk: Chunk): void {
    const xhr = new XMLHttpRequest()
    chunk.state = 'sending'
    chunk.loaded = 0
    chunk.xhr = xhr
    this.inflight += 1
    xhr.open('PUT', `${this.base}/uploads/${job.session!.id}/chunks/${chunk.index}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = event => {
      chunk.loaded = Math.min(event.loaded, chunk.end - chunk.start)
      this.emit()
    }
    xhr.onloadend = () => {
      this.inflight -= 1
      if (chunk.xhr !== xhr) {
        this.pump()
        return
      }
      chunk.xhr = null
      if (xhr.status >= 200 && xhr.status < 300) {
        chunk.state = 'done'
        chunk.loaded = chunk.end - chunk.start
        chunk.attempts = 0
      } else {
        chunk.state = 'pending'
        chunk.loaded = 0
        const failure = failureOf(xhr)
        if (failure.code === 'uploadNotFound') this.restart(job)
        else this.failed(job, failure, () => {}, chunk)
      }
      this.emit()
      this.pump()
    }
    xhr.send(job.file.slice(chunk.start, chunk.end))
  }

  private complete(job: Job): void {
    job.busy = 'completing'
    this.inflight += 1
    fetch(`${this.base}/uploads/${job.session!.id}/complete`, { method: 'POST' })
      .then(async response => {
        if (response.ok) {
          this.finish(job, storedItem(await response.text()))
          return
        }
        const failure = await this.responseFailure(response)
        if (failure.code === 'uploadIncomplete') {
          // Some pieces didn't make it after all: ask which, and send those again.
          const status = await fetch(`${this.base}/uploads/${job.session!.id}`).then(r => (r.ok ? r.json() : null))
          if (status) job.chunks = this.cut(job.file.size, status as UploadSession)
          job.attempts += 1
          if (job.attempts > MAX_ATTEMPTS) this.fail(job, 'uploadFailed')
          return
        }
        throw failure
      })
      .catch(error => {
        const failure: Failure = isFailure(error) ? error : { status: 0, code: null }
        if (failure.code === 'uploadNotFound') this.restart(job)
        else this.failed(job, failure, () => {})
      })
      .finally(() => {
        this.inflight -= 1
        job.busy = null
        this.emit()
        this.pump()
      })
  }

  private async responseFailure(response: Response): Promise<Failure> {
    const body = await response.json().catch(() => null)
    return { status: response.status, code: isApiErrorCode(body?.error) ? body.error : null }
  }

  /** The server forgot the upload (it sat paused for a day, or the server restarted): start it over, once. */
  private restart(job: Job): void {
    job.resets += 1
    if (job.resets > 2) {
      this.fail(job, 'uploadFailed')
      return
    }
    this.abort(job)
    job.session = null
    job.chunks = []
    job.status = 'waiting'
  }

  /** Decide what a failed request means: try again later, or give up on the file. */
  private failed(job: Job, failure: Failure, again: () => void, chunk?: Chunk): void {
    if (failure.status === 401) {
      for (const other of this.jobs) if (other.status === 'waiting' || other.status === 'uploading') this.fail(other, 'unauthorized')
      return
    }
    if (!retryable(failure)) {
      this.fail(job, failure.code ?? 'uploadFailed')
      return
    }
    if (failure.status === 0 && navigator.onLine === false) {
      // Offline: wait for the connection without spending a try.
      this.offline = true
      again()
      return
    }
    const holder = chunk ?? job
    holder.attempts += 1
    if (holder.attempts > MAX_ATTEMPTS) {
      this.fail(job, failure.code ?? 'uploadFailed')
      return
    }
    holder.notBefore = Date.now() + backoff(holder.attempts)
    again()
  }

  private finish(job: Job, item: ItemDto | null): void {
    job.status = 'done'
    job.item = item
    job.speed = 0
    job.session = null
    job.chunks = []
    this.settle()
    if (item) for (const listener of this.uploadedListeners) listener(item)
  }

  private fail(job: Job, code: ApiErrorCode): void {
    this.abort(job)
    job.status = 'failed'
    job.error = code
    job.speed = 0
    this.settle()
  }

  /** Stop a file's requests. Each is detached first, so its late answer is ignored. */
  private abort(job: Job): void {
    const direct = job.direct
    job.direct = null
    job.directLoaded = 0
    direct?.abort()
    for (const chunk of job.chunks) {
      const xhr = chunk.xhr
      if (!xhr) continue
      chunk.xhr = null
      chunk.state = 'pending'
      chunk.loaded = 0
      xhr.abort()
    }
  }

  /** Note when everything that can finish has. */
  private settle(): void {
    const open = this.jobs.some(job => job.status === 'waiting' || job.status === 'uploading' || job.status === 'paused')
    if (!open && this.jobs.length > 0) this.batchEnd ??= Date.now()
  }

  /* --- progress --------------------------------------------------------- */

  private sentOf(job: Job): number {
    if (job.status === 'done') return job.file.size
    if (job.direct) return job.directLoaded
    return job.chunks.reduce((sum, chunk) => sum + (chunk.state === 'pending' ? 0 : chunk.loaded), 0)
  }

  /** Sample the speeds four times a second while anything is moving. */
  private tick(): void {
    const moving = this.jobs.some(job => job.status === 'uploading' || job.status === 'waiting')
    if (moving && !this.ticker) {
      this.ticker = setInterval(() => this.measure(), 250)
      this.measure()
    } else if (!moving && this.ticker) {
      clearInterval(this.ticker)
      this.ticker = null
      this.meter.reset()
      for (const job of this.jobs) {
        job.meter.reset()
        job.speed = 0
      }
      this.emit()
    }
  }

  private measure(): void {
    const now = Date.now()
    let total = 0
    for (const job of this.jobs) {
      const sent = this.sentOf(job)
      total += sent
      job.speed = job.status === 'uploading' ? job.meter.sample(sent, now) : 0
      if (job.status !== 'uploading') job.meter.reset()
    }
    this.meter.sample(total, now)
    this.emit()
  }

  private emit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.snapshot = this.build()
      for (const listener of this.listeners) listener()
    }, 60)
  }

  private build(): UploadSnapshot {
    const now = Date.now()
    const uploads: UploadView[] = this.jobs.map(job => ({
      id: job.id,
      name: job.name,
      size: job.file.size,
      type: job.file.type,
      destination: job.destination,
      status: job.status,
      sent: this.sentOf(job),
      speed: job.speed,
      error: job.error,
      item: job.item,
    }))

    const counted = uploads.filter(upload => upload.status !== 'failed')
    const bytes = counted.reduce((sum, upload) => sum + upload.size, 0)
    const sent = counted.reduce((sum, upload) => sum + upload.sent, 0)
    const moving = uploads.filter(upload => upload.status === 'uploading' || upload.status === 'waiting')
    const left = moving.reduce((sum, upload) => sum + upload.size - upload.sent, 0)
    const speed = this.meter.rate
    const warm = this.batchStart !== null && now - this.batchStart > WARM_UP_MS
    const remaining = moving.length > 0 && speed > 1024 && warm && !this.offline ? left / speed : null

    return {
      uploads,
      totals: {
        count: uploads.length,
        done: uploads.filter(upload => upload.status === 'done').length,
        failed: uploads.filter(upload => upload.status === 'failed').length,
        paused: uploads.filter(upload => upload.status === 'paused').length,
        active: moving.length,
        bytes,
        sent,
        speed: moving.length > 0 ? speed : 0,
        remaining,
        startedAt: this.batchStart,
        finishedAt: this.batchEnd,
        offline: this.offline,
      },
    }
  }
}

function isFailure(value: unknown): value is Failure {
  return typeof value === 'object' && value !== null && 'status' in value && 'code' in value
}

let shared: UploadManager | null = null

/** One manager for the whole app, so uploads carry on while you move between pages. */
export function uploadManager(): UploadManager {
  shared ??= new UploadManager()
  return shared
}
