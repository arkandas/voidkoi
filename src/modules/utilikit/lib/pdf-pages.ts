export const PDF_MODES = ['merge', 'extract', 'split', 'images'] as const
export type PdfMode = (typeof PDF_MODES)[number]

export const SPLIT_MODES = ['every', 'ranges'] as const
export type SplitMode = (typeof SPLIT_MODES)[number]

export const IMAGE_FORMATS = ['png', 'jpeg'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export const IMAGE_DPIS = [72, 150, 300] as const
export type ImageDpi = (typeof IMAGE_DPIS)[number]

export const MAX_IMAGE_PAGES: Record<ImageDpi, number> = { 72: 200, 150: 100, 300: 30 }
export const MAX_MERGE_FILES = 30
export const MAX_PDF_UPLOAD = 200 * 1024 * 1024

export type PageSelection = { ok: true; groups: number[][] } | { ok: false; error: 'invalidPages' | 'pageOutOfRange' }

const TOKEN = /^(\d*)-(\d*)$|^(\d+)$/

export function parsePageGroups(input: string, pageCount: number): PageSelection {
  const text = input.trim()
  if (!text || /^all$/i.test(text)) return { ok: true, groups: [Array.from({ length: pageCount }, (_, index) => index + 1)] }

  const groups: number[][] = []
  for (const token of text.replace(/\s*[-–]\s*/g, '-').split(/[\s,;]+/).filter(Boolean)) {
    const match = TOKEN.exec(token)
    if (!match || token === '-') return { ok: false, error: 'invalidPages' }

    const [, from, to, single] = match
    const start = single ? Number(single) : from ? Number(from) : 1
    const end = single ? Number(single) : to ? Number(to) : pageCount
    if (start < 1 || end < 1 || start > pageCount || end > pageCount) return { ok: false, error: 'pageOutOfRange' }

    const step = start <= end ? 1 : -1
    const group: number[] = []
    for (let page = start; page !== end + step; page += step) group.push(page)
    groups.push(group)
  }

  return groups.length > 0 ? { ok: true, groups } : { ok: false, error: 'invalidPages' }
}

export function pageRangeLabel(pages: number[]): string {
  if (pages.length === 1) return `page-${pages[0]}`
  const ascending = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1)
  return ascending ? `pages-${pages[0]}-${pages[pages.length - 1]}` : `pages-${pages.join('-')}`.slice(0, 60)
}
