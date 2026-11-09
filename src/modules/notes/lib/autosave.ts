export type SaveState = 'saved' | 'saving' | 'error'

export interface Draft {
  title: string
  content: string
}

export interface AutosaveOptions<T> {
  send(id: number, draft: Draft): Promise<T>
  /** A draft reached the server. */
  saved(id: number, result: T): void
  /** The note no longer exists, so its draft has nowhere to go. */
  lost(id: number, error: unknown): void
  isGone(error: unknown): boolean
  state(state: SaveState): void
  /** A pause in typing this long saves. */
  delay?: number
}

/**
 * Saves notes a moment after typing stops. It keeps the latest draft of each
 * note until the server has it, sends one at a time so an older save can't
 * land after a newer one, and retries what fails, more slowly each time.
 */
export class Autosaver<T> {
  private drafts = new Map<number, Draft>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private busy = false
  private failures = 0

  constructor(private options: AutosaveOptions<T>) {}

  /** Something is not on the server yet. */
  get pending(): boolean {
    return this.busy || this.drafts.size > 0
  }

  /** The newest text of a note that isn't saved yet. */
  draft(id: number): Draft | undefined {
    return this.drafts.get(id)
  }

  change(id: number, draft: Draft): void {
    this.drafts.set(id, draft)
    if (this.failures === 0) this.options.state('saving')
    this.wait(this.options.delay ?? 1200)
  }

  /** Save now: on switching notes, on ⌘S, on leaving. */
  flush(): void {
    this.failures = 0
    this.stop()
    void this.pump()
  }

  /** Forget a note's draft. */
  discard(id: number): void {
    this.drafts.delete(id)
    if (!this.pending) {
      this.stop()
      this.failures = 0
      this.options.state('saved')
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private wait(ms: number): void {
    this.stop()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.pump()
    }, ms)
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    const next = this.drafts.entries().next()
    if (next.done) return
    const [id, draft] = next.value

    this.busy = true
    try {
      const result = await this.options.send(id, draft)
      this.busy = false
      if (this.drafts.get(id) === draft) this.drafts.delete(id)
      this.failures = 0
      this.options.saved(id, result)
    } catch (error) {
      this.busy = false
      if (this.options.isGone(error)) {
        if (this.drafts.get(id) === draft) this.drafts.delete(id)
        this.options.lost(id, error)
      } else {
        // To the back of the line, so one note that can't be saved doesn't hold up the others.
        if (this.drafts.get(id) === draft) {
          this.drafts.delete(id)
          this.drafts.set(id, draft)
        }
        this.failures += 1
        this.options.state('error')
        this.wait(this.failures <= 3 ? 2000 * 2 ** (this.failures - 1) : 15000)
        return
      }
    }

    if (this.drafts.size === 0) this.options.state('saved')
    else if (!this.timer) void this.pump()
  }
}
