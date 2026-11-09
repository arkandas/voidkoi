import { Readable } from 'node:stream'
import { makeZip, predictLength } from 'client-zip'
import { contentDisposition } from '@/lib/http'
import { treeOf } from '@/modules/files/lib/items'
import { freeName, nameKey } from '@/modules/files/lib/names'
import { readStored } from '@/lib/storage'

interface ZipEntry {
  path: string
  folder: boolean
  size: number
  key: string | null
  modified: Date
}

/** Everything in these items, as paths inside one zip. Top-level names that clash are numbered. */
export async function zipEntries(rootIds: number[]): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = []
  const taken = new Set<string>()
  for (const rootId of rootIds) {
    const tree = await treeOf(rootId)
    const top = tree[0]
    if (!top) continue
    const name = freeName(top.path, taken, top.kind === 'FOLDER')
    taken.add(nameKey(name))
    for (const row of tree) {
      entries.push({
        path: name + row.path.slice(top.path.length),
        folder: row.kind === 'FOLDER',
        size: Number(row.size),
        key: row.storage_key,
        modified: row.updated_at,
      })
    }
  }
  return entries
}

/**
 * Stream a zip of `entries`, stored rather than compressed: most of what
 * people keep is already compressed. The length is known up front, so the
 * browser shows real progress. Files are opened one at a time as the zip
 * reaches them.
 */
export function zipResponse(entries: ZipEntry[], filename: string): Response {
  const meta = entries.map(entry =>
    entry.folder
      ? { name: `${entry.path}/`, lastModified: entry.modified }
      : { name: entry.path, size: entry.size, lastModified: entry.modified },
  )
  const length = predictLength(meta)

  async function* inputs() {
    for (const entry of entries) {
      if (entry.folder) {
        yield { name: `${entry.path}/`, lastModified: entry.modified }
      } else {
        yield {
          name: entry.path,
          lastModified: entry.modified,
          size: entry.size,
          input: Readable.toWeb(readStored('files', entry.key!)) as ReadableStream<Uint8Array>,
        }
      }
    }
  }

  return new Response(makeZip(inputs(), { length }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': length.toString(),
      'Content-Disposition': contentDisposition('attachment', filename),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
