import type { SearchResult } from '@/modules/wiki/lib/api-types'
import { prisma } from '@/lib/prisma'
import { access, listed, type Reader, type WikiIndex } from '@/modules/wiki/lib/tree'

const LIMIT = 20
const AROUND = 70

/** The most of a page read for a snippet: its first 200,000 characters. */
const SNIPPET_SOURCE = 200_000

/**
 * Markdown as words: what a reader sees in a snippet. Line by line, with
 * patterns that stop at the end of a line or after a few hundred characters,
 * so no page can make it slow.
 */
export function plainText(markdown: string): string {
  const words: string[] = []
  let fenced = false
  for (const line of markdown.slice(0, SNIPPET_SOURCE).split('\n')) {
    if (/^ {0,3}(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    // A table's rule line, a divider, the end of a callout.
    if (/^[ \t|:\-=*_]*$/.test(line) || /^ {0,3}:::[ \t]*$/.test(line)) continue
    words.push(
      line
        .replace(/^ {0,3}(?:#{1,6}|>|[-*+]|\d{1,9}[.)]|:::\w{0,40})[ \t]*/, '')
        .replace(/!\[([^\]\n]{0,300})\]\([^)\n]{0,1000}\)/g, '$1')
        .replace(/\[([^\]\n]{0,300})\]\([^)\n]{0,1000}\)/g, '$1')
        .replace(/<[^<>\n]{0,300}>/g, ' ')
        .replace(/[*_`~|]/g, ''),
    )
  }
  return words.join(' ').replace(/\s+/g, ' ').trim()
}

/** The words around the first match, the match between ‹ and ›. Null when only the title matched. */
export function snippet(text: string, query: string): string | null {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at === -1) return null
  const start = Math.max(0, at - AROUND)
  const end = Math.min(text.length, at + query.length + AROUND)
  const before = (start > 0 ? '…' : '') + text.slice(start, at).replace(/^\S*\s/, start > 0 ? '' : '$&')
  const after = text.slice(at + query.length, end) + (end < text.length ? '…' : '')
  return `${before}‹${text.slice(at, at + query.length)}›${after}`
}

/**
 * Pages and folders whose title or text holds the query, among those the
 * reader sees. Editors also find what is only in drafts.
 */
export async function search(index: WikiIndex, reader: Reader, query: string): Promise<SearchResult[]> {
  const words = query.replace(/\u0000/g, '').trim()
  if (!words) return []
  const pattern = `%${words.replace(/[\\%_]/g, '\\$&')}%`
  const visible = index.order.filter(entry => listed(entry, reader)).map(entry => entry.node.id)
  if (visible.length === 0) return []

  const rows = await prisma.$queryRaw<Array<{ id: number; title: string; content: string | null }>>`
    SELECT n.id, n.title,
      CASE WHEN ${reader.editor} AND n.draft_content IS NOT NULL THEN n.draft_content ELSE r.content END AS content
    FROM wiki_nodes n
    LEFT JOIN wiki_revisions r ON r.id = n.published_revision_id
    WHERE n.deleted_at IS NULL
      AND n.id = ANY(${visible})
      AND (n.title ILIKE ${pattern}
        OR (${reader.editor} AND n.draft_title ILIKE ${pattern})
        OR r.content ILIKE ${pattern}
        OR (${reader.editor} AND n.draft_content ILIKE ${pattern}))
    LIMIT 200`

  const results: Array<SearchResult & { score: number }> = []
  for (const row of rows) {
    const entry = index.byId.get(row.id)
    if (!entry || !listed(entry, reader)) continue
    const locked = entry.node.kind === 'PAGE' && access(entry, reader) === 'password'
    const titleHit = entry.node.title.toLowerCase().includes(words.toLowerCase())
    results.push({
      id: entry.node.id,
      kind: entry.node.kind === 'FOLDER' ? 'folder' : 'page',
      title: entry.node.title,
      path: entry.path,
      // A locked page's text stays behind its password.
      snippet: locked || !row.content ? null : snippet(plainText(row.content), words),
      locked,
      score: (titleHit ? 2 : 0) + (entry.node.title.toLowerCase().startsWith(words.toLowerCase()) ? 1 : 0),
    })
  }
  return results
    .filter(result => result.snippet !== null || result.title.toLowerCase().includes(words.toLowerCase()))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, LIMIT)
    .map(result => ({ id: result.id, kind: result.kind, title: result.title, path: result.path, snippet: result.snippet, locked: result.locked }))
}
