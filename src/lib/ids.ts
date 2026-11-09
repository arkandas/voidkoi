import { randomBytes } from 'node:crypto'

/** 128 random bits, base64url: the name of a stored file, an avatar or an upload. */
export function newKey(): string {
  return randomBytes(16).toString('base64url')
}

export function isKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value)
}

/** 144 random bits for a share link, so the link itself is the secret. */
export function newToken(): string {
  return randomBytes(18).toString('base64url')
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value)
}
