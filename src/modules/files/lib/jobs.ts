import { canThumbnail } from '@/lib/file-types'
import { purgeTrash } from '@/modules/files/lib/items'
import { prisma } from '@/lib/prisma'
import { queueThumbnail } from '@/modules/files/lib/thumbnails'
import { sweepUploads } from '@/modules/files/lib/uploads'

const HOUR = 60 * 60 * 1000

let started = false

async function cleanUp(): Promise<void> {
  const abandoned = await sweepUploads()
  if (abandoned > 0) console.log(`Files: removed ${abandoned} unfinished upload(s)`)
  const purged = await purgeTrash()
  if (purged > 0) console.log(`Files: emptied ${purged} item(s) from the trash`)
}

/**
 * Thumbnails for files that never had one tried: uploaded before their type
 * got thumbnails, like PDFs, or while the server was down.
 */
async function catchUpThumbnails(): Promise<void> {
  const files = await prisma.item.findMany({
    where: { kind: 'FILE', has_thumbnail: false, thumbnail_tried: false },
    select: { id: true, mime: true, name: true },
  })
  const none = files.filter(file => !canThumbnail(file.mime, file.name)).map(file => file.id)
  if (none.length > 0) await prisma.item.updateMany({ where: { id: { in: none } }, data: { thumbnail_tried: true } })
  for (const file of files) if (canThumbnail(file.mime, file.name)) queueThumbnail(file.id)
}

/** Housekeeping: abandoned uploads and old trash, at startup and every hour. Missing thumbnails, at startup. */
export async function startFilesJobs(): Promise<void> {
  if (started) return
  started = true
  void cleanUp().catch(error => console.error('Cleanup failed:', error))
  void catchUpThumbnails().catch(error => console.error('Catching up on thumbnails failed:', error))
  setInterval(() => void cleanUp().catch(error => console.error('Cleanup failed:', error)), HOUR).unref()
}
