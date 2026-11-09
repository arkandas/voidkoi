/** How long the wiki's texts may be. */
export const LIMITS = {
  title: 200,
  slug: 100,
  wikiName: 60,
  publishMessage: 300,
  /** Characters of Markdown in one page. */
  content: 1_000_000,
  /** A page's, a folder's or the wiki's password. */
  password: 200,
} as const

/** Text as the database can keep it: without NUL characters. */
export function withoutNul(text: string): string {
  return text.includes('\u0000') ? text.replace(/\u0000/g, '') : text
}

const VISIBILITIES = ['inherit', 'public', 'private', 'password'] as const

export function isVisibility(value: unknown): value is (typeof VISIBILITIES)[number] {
  return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value)
}
