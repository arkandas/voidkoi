import { readApiError } from '@/lib/error-codes'

/** A file name from a note's title: plain letters and digits, accents dropped. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'untitled'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportMarkdown(title: string, content: string): void {
  downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${slugify(title)}.md`)
}

/** Word, made on the server: it embeds the note's pictures and turns formulas into equations. */
export async function exportDocx(title: string, content: string): Promise<void> {
  const response = await fetch('/api/notes/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  })
  if (!response.ok) throw await readApiError(response, 'generic')
  downloadBlob(await response.blob(), `${slugify(title)}.docx`)
}
