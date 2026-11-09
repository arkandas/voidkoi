import { LIMITS } from '@/modules/wiki/lib/validate'

/** Top-level addresses the app itself uses, so no page can take them. */
export const RESERVED_SLUGS = new Set([
  'login',
  'setup',
  'admin',
  'settings',
  'api',
  's',
  'edit',
  'history',
  'search',
  'trash',
  'changes',
  'new',
])

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIMITS.slug && SLUG.test(value)
}

/** "Getting Started: Á primer" → "getting-started-a-primer". Never empty. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/, '')
  return slug || 'page'
}

/** `base`, or `base-2`, `base-3`… whichever is free. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, topLevel: boolean): string {
  const free = (slug: string) => !taken.has(slug) && !(topLevel && RESERVED_SLUGS.has(slug))
  if (free(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, LIMITS.slug - suffix.length).replace(/-+$/, '')}${suffix}`
    if (free(candidate)) return candidate
  }
}
