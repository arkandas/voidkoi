import { ApiError, readApiError } from '@/lib/error-codes'
import type { NoteImageDto } from '@/modules/notes/lib/api-types'

/** The longest side a pasted picture keeps: sharp on a wide screen, a fraction of a camera's size. */
const MAX_EDGE = 1600

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), type, quality)
  })
}

/** Smaller and re-encoded when it is big. GIFs stay as they are, so they keep moving. */
async function shrink(file: File): Promise<File> {
  if (file.type === 'image/gif') return file

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 400 * 1024) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const type = file.type === 'image/png' || file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, type, 0.82)
  const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg')
  return new File([blob], name, { type })
}

export async function uploadNoteImage(original: File): Promise<NoteImageDto> {
  const file = await shrink(original).catch(() => original)
  const bitmap = await createImageBitmap(file).catch(() => null)
  const form = new FormData()
  form.append('file', file)
  if (bitmap) {
    form.append('width', String(bitmap.width))
    form.append('height', String(bitmap.height))
    bitmap.close()
  }

  let response: Response
  try {
    response = await fetch('/api/notes/images', { method: 'POST', body: form })
  } catch {
    throw new ApiError('uploadFailed', 0)
  }
  if (!response.ok) throw await readApiError(response, 'uploadFailed')
  return response.json() as Promise<NoteImageDto>
}

/** The Markdown that shows a picture, its file name as the alt text. */
export function imageMarkdown(file: File, image: NoteImageDto): string {
  const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '').slice(0, 80) || 'image'
  return `![${alt}](${image.url})`
}
