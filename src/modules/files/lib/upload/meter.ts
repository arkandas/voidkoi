/**
 * A transfer rate in bytes per second, smoothed over about `tau` seconds so
 * the speed and the time left read calmly instead of jumping with every
 * progress event.
 */
export class RateMeter {
  private last: { at: number; bytes: number } | null = null
  rate = 0

  constructor(private readonly tau = 3) {}

  /** Record the running total of bytes at time `at` (ms). Returns the smoothed rate. */
  sample(bytes: number, at: number): number {
    if (!this.last) {
      this.last = { at, bytes }
      return this.rate
    }
    const seconds = (at - this.last.at) / 1000
    if (seconds <= 0) return this.rate
    const instant = Math.max(0, (bytes - this.last.bytes) / seconds)
    const weight = 1 - Math.exp(-seconds / this.tau)
    this.rate = this.rate === 0 ? instant : this.rate + weight * (instant - this.rate)
    this.last = { at, bytes }
    return this.rate
  }

  reset(): void {
    this.last = null
    this.rate = 0
  }
}

/** How long a retry waits: 1 s, 2 s, 4 s… up to 30 s, with some jitter so retries don't arrive together. */
export function backoff(attempt: number, random = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1))
  return Math.round(base * (0.8 + random() * 0.4))
}
