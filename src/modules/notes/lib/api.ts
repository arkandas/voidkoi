import { request } from '@/lib/api'
import type { FolderChanges, NoteChanges, NoteDto, NoteFolderDto } from '@/modules/notes/lib/api-types'
import type { NoteSettings } from '@/modules/notes/lib/fonts'

/** Notes' calls. */
export const notesApi = {
  list: () => request<NoteDto[]>('GET', '/notes', undefined, 'loadFailed'),
  create: (note: NoteChanges) => request<NoteDto>('POST', '/notes', note, 'saveFailed'),
  update: (id: number, changes: NoteChanges) => request<NoteDto>('PATCH', `/notes/${id}`, changes, 'saveFailed'),
  /** Into the trash. */
  trash: (id: number) => request<unknown>('DELETE', `/notes/${id}`, undefined, 'deleteFailed'),
  reorder: (updates: { id: number; position: number }[]) => request<unknown>('POST', '/notes/reorder', { updates }, 'saveFailed'),

  trashList: () => request<NoteDto[]>('GET', '/notes/trash', undefined, 'loadFailed'),
  restore: (id: number) => request<NoteDto>('POST', `/notes/trash/${id}/restore`, undefined, 'restoreFailed'),
  deleteForever: (id: number) => request<unknown>('DELETE', `/notes/trash/${id}`, undefined, 'deleteFailed'),
  emptyTrash: () => request<{ deleted: number }>('DELETE', '/notes/trash', undefined, 'deleteFailed'),

  folders: () => request<NoteFolderDto[]>('GET', '/notes/folders', undefined, 'loadFailed'),
  createFolder: (name: string) => request<NoteFolderDto>('POST', '/notes/folders', { name }, 'saveFailed'),
  updateFolder: (id: number, changes: FolderChanges) => request<NoteFolderDto>('PATCH', `/notes/folders/${id}`, changes, 'saveFailed'),
  deleteFolder: (id: number) => request<unknown>('DELETE', `/notes/folders/${id}`, undefined, 'deleteFailed'),

  settings: () => request<NoteSettings>('GET', '/notes/settings', undefined, 'loadFailed'),
  saveSettings: (settings: NoteSettings) => request<NoteSettings>('PUT', '/notes/settings', settings, 'saveFailed'),
}
