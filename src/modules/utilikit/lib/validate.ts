/** `map[key]` when `key` is one of the map's own keys, so a form value like "toString" can't reach the prototype. */
export function ownValue<T>(map: Record<string, T>, key: unknown): T | undefined {
  return typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined
}
