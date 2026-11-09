/**
 * Wrong passwords to a page, a folder, the wiki or a link, counted per address.
 * Only failures count, so opening pages often is never slowed.
 */

const failures = new Map<string, number[]>()

/** The most keys kept: past this, the ones used longest ago are forgotten. */
const MAX_KEYS = 10_000

function recent(key: string, windowMs: number, now: number): number[] {
  return (failures.get(key) ?? []).filter(at => now - at < windowMs)
}

/** Whether `key` has failed `max` times in the last `windowMs`: then it waits. */
export function blocked(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  return recent(key, windowMs, now).length >= max
}

/** A wrong password for `key`. */
export function fail(key: string, windowMs: number, now = Date.now()): void {
  const times = recent(key, windowMs, now)
  times.push(now)
  // Moved to the end, so the map stays ordered from least to most recently used.
  failures.delete(key)
  failures.set(key, times)
  if (failures.size > MAX_KEYS) {
    let excess = failures.size - MAX_KEYS
    for (const other of failures.keys()) {
      if (excess-- <= 0) break
      failures.delete(other)
    }
  }
}
