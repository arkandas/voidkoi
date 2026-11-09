/** Text for a LIKE or ILIKE pattern, matched as written: `%`, `_` and the escape character escaped. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}

/** A Prisma filter for text equal to `text`, ignoring case. Prisma sends it as ILIKE, so the pattern characters are escaped. */
export function equalsIgnoringCase(text: string): { equals: string; mode: 'insensitive' } {
  return { equals: escapeLike(text), mode: 'insensitive' }
}
