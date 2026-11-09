/** A note as the API sends it. */
export interface NoteDto {
  id: number
  title: string
  content: string
  /** The folder's name, or empty when the note is in none. */
  folder: string
  /** Its place in its folder. */
  position: number
  createdAt: string
  updatedAt: string
  /** When it went to the trash. */
  deletedAt: string | null
}

export interface NoteFolderDto {
  id: number
  name: string
  color: string | null
  icon: string | null
}

/** A picture pasted into a note. */
export interface NoteImageDto {
  id: string
  url: string
  width: number
  height: number
}

/** What a note can change in one save. */
export interface NoteChanges {
  title?: string
  content?: string
  folder?: string
}

export interface FolderChanges {
  name?: string
  color?: string | null
  icon?: string | null
}
