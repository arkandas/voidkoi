import type { Note, NoteFolder } from '@/generated/prisma/client'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'
import { parseId, requiredText } from '@/lib/validate'
import type { NoteDto, NoteFolderDto } from '@/modules/notes/lib/api-types'
import { isFolderColor, isFolderIcon } from '@/modules/notes/lib/folders'

/** A note's body as JSON: its text at the most, escaped, in UTF-8. */
export const NOTE_BODY_BYTES = 24 * 1024 * 1024

export const LIMITS = {
  title: 500,
  /** Characters: far more than any note, short of what would strain the editor. */
  content: 5_000_000,
  folderName: 80,
} as const

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    folder: note.folder,
    position: note.position,
    createdAt: note.created_at.toISOString(),
    updatedAt: note.updated_at.toISOString(),
    deletedAt: note.deleted_at?.toISOString() ?? null,
  }
}

export function toFolderDto(folder: NoteFolder): NoteFolderDto {
  return { id: folder.id, name: folder.name, color: folder.color, icon: folder.icon }
}

/** One of the account's notes, in the trash or not. */
export async function ownedNote(userId: number, id: number | null): Promise<Note> {
  const note = id ? await prisma.note.findFirst({ where: { id, user_id: userId } }) : null
  if (!note) throw new ApiError('notFound', 404)
  return note
}

export async function ownedFolder(userId: number, id: number | null): Promise<NoteFolder> {
  const folder = id ? await prisma.noteFolder.findFirst({ where: { id, user_id: userId } }) : null
  if (!folder) throw new ApiError('folderNotFound', 404)
  return folder
}

/** The place after the last note in a folder. */
export async function endOf(userId: number, folder: string): Promise<number> {
  const { _max } = await prisma.note.aggregate({
    where: { user_id: userId, folder, deleted_at: null },
    _max: { position: true },
  })
  return (_max.position ?? -1) + 1
}

export function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || value.length > LIMITS.title) throw new ApiError('invalidInput', 400)
  return value
}

export function parseContent(value: unknown): string {
  if (typeof value !== 'string' || value.length > LIMITS.content) throw new ApiError('invalidInput', 400)
  return value
}

export function parseFolderName(value: unknown): string {
  const name = requiredText(value, LIMITS.folderName)
  if (!name) throw new ApiError('invalidName', 400)
  return name
}

export function parseFolderColor(value: unknown): string | null {
  if (value === null) return null
  if (!isFolderColor(value)) throw new ApiError('invalidInput', 400)
  return value
}

/** No icon is the plain folder. */
export function parseFolderIcon(value: unknown): string | null {
  if (value === null || value === 'folder') return null
  if (!isFolderIcon(value)) throw new ApiError('invalidInput', 400)
  return value
}

/** A folder a note can go in: one of the account's, by name, or none. */
export async function usableFolder(userId: number, value: unknown): Promise<string> {
  if (value === '') return ''
  if (typeof value !== 'string') throw new ApiError('invalidInput', 400)
  const folder = await prisma.noteFolder.findFirst({ where: { user_id: userId, name: value }, select: { name: true } })
  if (!folder) throw new ApiError('folderNotFound', 404)
  return folder.name
}

/** Whether a folder by this name still exists, for a note coming back from the trash. */
export async function folderExists(userId: number, name: string): Promise<boolean> {
  if (name === '') return true
  return (await prisma.noteFolder.count({ where: { user_id: userId, name } })) > 0
}

/** `[{ id, position }]` from a request, or null when any of it is off. */
export function parsePlaces(value: unknown): { id: number; position: number }[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) return null
  const places: { id: number; position: number }[] = []
  for (const entry of value) {
    const id = parseId((entry as { id?: unknown } | null)?.id)
    const position = (entry as { position?: unknown } | null)?.position
    if (!id || typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) return null
    places.push({ id, position })
  }
  return places
}
