/** Where an uploaded image is served from. Pages refer to it by this address. */
export const IMAGE_PREFIX = '/api/wiki/images/'

export function imageUrl(key: string): string {
  return `${IMAGE_PREFIX}${key}`
}

/** The keys of uploaded images a page's Markdown shows. */
export function imageKeysIn(markdown: string): string[] {
  const keys = new Set<string>()
  for (const match of markdown.matchAll(/\/api\/wiki\/images\/([A-Za-z0-9_-]{22})/g)) keys.add(match[1]!)
  return [...keys]
}
