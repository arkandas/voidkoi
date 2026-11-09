const hits = new Map<string, number[]>()

/** Keys kept at most: past this the oldest go, so a flood of new keys can't grow memory without end. */
const MAX_KEYS = 10_000
let lastSweep = 0

/** True while `key` has made fewer than `max` attempts in the last `windowMs`. Counts this one. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(at => now - at < windowMs)
  const allowed = recent.length < max
  if (allowed) recent.push(now)
  hits.delete(key)
  hits.set(key, recent)
  if (hits.size > MAX_KEYS / 2 && now - lastSweep > 60_000) {
    lastSweep = now
    for (const [other, times] of hits) {
      if (times.every(at => now - at >= windowMs)) hits.delete(other)
    }
  }
  // Least recently used first, as the map keeps them.
  for (const other of hits.keys()) {
    if (hits.size <= MAX_KEYS) break
    hits.delete(other)
  }
  return allowed
}

/** The address a request came from, as `server.ts` worked it out. Client-sent forwarding headers can't change it. */
export function clientAddress(request: Request): string {
  return request.headers.get('x-voidkoi-client') || 'local'
}
