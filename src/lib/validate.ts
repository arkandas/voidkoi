export const LIMITS = {
  username: 50,
  name: 80,
  email: 254,
  passwordMin: 6,
  passwordMax: 200,
  linkPasswordMax: 200,
  maxDownloads: 1_000_000,
} as const

const USER_ROLES = ['ADMIN', 'USER'] as const
export type UserRoleValue = (typeof USER_ROLES)[number]

/** The largest id the database stores: ids are 4-byte integers. */
const MAX_ID = 2_147_483_647

/** A row's id from a request: a whole number the database can hold, or null. */
export function parseId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,10}$/.test(value.trim()) ? Number(value) : NaN
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_ID ? id : null
}

/** A folder id, or null for the top level ("root" or nothing). Undefined when it isn't either. */
export function parseFolderId(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '' || value === 'root') return null
  return parseId(value) ?? undefined
}

export function parseIds(value: unknown, max = 1000): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null
  const ids = value.map(parseId)
  return ids.every((id): id is number => id !== null) ? [...new Set(ids)] : null
}

export function requiredText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : null
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isUserRole(value: unknown): value is UserRoleValue {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}

/** A byte count from JSON: a whole number from 1 byte to 1 PB. */
export function parseBytes(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2 ** 50 ? value : null
}

/**
 * A link's password from a request body: a new one, null to remove it, or
 * undefined to keep the one it has, when `password` is left out. False when
 * it isn't any of those.
 */
export function parseLinkPassword(body: Record<string, unknown>): string | null | undefined | false {
  if (!('password' in body)) return undefined
  const password = body.password
  if (password === null) return null
  if (typeof password === 'string' && password.length > 0 && password.length <= LIMITS.linkPasswordMax) return password
  return false
}

/** A link's expiry: a moment after `now`, or null for none. False when it isn't one. */
export function parseExpiry(value: unknown, now = new Date()): Date | null | false {
  if (value === null || value === undefined) return null
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN)
  return Number.isNaN(date.getTime()) || date <= now ? false : date
}
