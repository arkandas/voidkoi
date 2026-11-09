export interface ByteRange {
  start: number
  /** Inclusive. */
  end: number
}

/**
 * One `bytes=` range from a Range header. Null means the whole file: no
 * header, several ranges or a form this doesn't read. 'unsatisfiable' when
 * the range starts past the end.
 */
export function parseRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, from, to] = match
  if (from === '' && to === '') return null

  if (from === '') {
    const suffix = Number(to)
    if (suffix === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(from)
  if (start >= size) return 'unsatisfiable'
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (end < start) return null
  return { start, end }
}

/**
 * RFC 6266: a plain-ASCII fallback, and the real name in UTF-8. Characters that
 * could end the header or the quoted name are dropped, and the name is never empty.
 */
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const cleaned = name.replace(/[\r\n"\\/]/g, '').trim() || 'download'
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, '_')
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
