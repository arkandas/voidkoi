/**
 * A token bucket: up to `capacity` at once, growing back at `perSecond`. Each
 * thing allowed takes a token; with none left, it is refused until one has
 * grown back. Times are milliseconds from a clock that never goes back.
 */
export class TokenBucket {
  private tokens: number;
  private at: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.at = now;
  }

  /** Take a token, if there is one. */
  take(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + (Math.max(0, now - this.at) / 1000) * this.perSecond);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
