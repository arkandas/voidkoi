import { api as suiteApi, download, request, urls as suiteUrls } from '@/lib/api'
import type {
  FavoriteEntry,
  FilesStatusDto,
  FolderListing,
  ItemDetail,
  ItemDto,
  LinkAccessDto,
  PublicShare,
  PublicUploadLink,
  SearchResult,
  SettingsDto,
  ShareInfo,
  SharedItem,
  SharedWithMeItem,
  StorageUser,
  TrashEntry,
} from '@/modules/files/lib/api-types'
import { ApiError, readApiError } from '@/lib/error-codes'

export { download }

export interface LinkChanges {
  access: LinkAccessDto
  /** Left out: keep the current password. Null: remove it. */
  password?: string | null
  expiresAt: string | null
  maxDownloads: number | null
}

export interface UploadLinkChanges {
  /** Left out: keep the current password. Null: remove it. */
  password?: string | null
  expiresAt: string | null
}

/**
 * Save a text file's new contents. `version` is the ETag it was edited from;
 * null replaces whatever is there. Answers with the file and its new version.
 */
async function saveText(id: number, text: string, version: string | null): Promise<{ item: ItemDto; version: string | null }> {
  let response: Response
  try {
    response = await fetch(`/api/files/items/${id}/content`, {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(version ? { 'If-Match': version } : {}) },
      body: text,
    })
  } catch {
    throw new ApiError('saveFailed', 0)
  }
  if (!response.ok) throw await readApiError(response, 'saveFailed')
  return { item: (await response.json()) as ItemDto, version: response.headers.get('etag') }
}

/** Files' calls, with the suite's own spread in. */
export const api = {
  ...suiteApi,
  status: () => request<FilesStatusDto>('GET', '/files/status', undefined, 'loadFailed'),
  markSharesSeen: () => request<unknown>('POST', '/files/shared-with-me/seen', undefined, 'saveFailed'),
  folder: (id: number | null) => request<FolderListing>('GET', `/files/folders/${id ?? 'root'}`, undefined, 'loadFailed'),
  item: (id: number) => request<ItemDetail>('GET', `/files/items/${id}`, undefined, 'loadFailed'),
  createFolder: (parentId: number | null, name: string) => request<ItemDto>('POST', '/files/folders', { parentId, name }, 'saveFailed'),
  ensurePath: (parentId: number | null, path: string) =>
    request<{ folder: ItemDto | null }>('POST', '/files/folders/path', { parentId, path }, 'saveFailed'),
  rename: (id: number, name: string) => request<ItemDto>('PATCH', `/files/items/${id}`, { name }, 'saveFailed'),
  move: (ids: number[], parentId: number | null) => request<ItemDto[]>('POST', '/files/items/move', { ids, parentId }, 'saveFailed'),
  trash: (ids: number[]) => request<{ trashed: number }>('POST', '/files/items/trash', { ids }, 'deleteFailed'),
  search: (query: string) => request<SearchResult[]>('GET', `/files/search?q=${encodeURIComponent(query)}`, undefined, 'loadFailed'),

  trashList: () => request<TrashEntry[]>('GET', '/files/trash', undefined, 'loadFailed'),
  restore: (id: number) => request<ItemDto>('POST', `/files/trash/${id}/restore`, undefined, 'restoreFailed'),
  deleteForever: (id: number) => request<unknown>('DELETE', `/files/trash/${id}`, undefined, 'deleteFailed'),
  emptyTrash: () => request<unknown>('DELETE', '/files/trash', undefined, 'deleteFailed'),

  shareInfo: (id: number) => request<ShareInfo>('GET', `/files/items/${id}/share`, undefined, 'loadFailed'),
  saveLink: (id: number, changes: LinkChanges) => request<ShareInfo>('PUT', `/files/items/${id}/share/link`, changes, 'saveFailed'),
  deleteLink: (id: number) => request<ShareInfo>('DELETE', `/files/items/${id}/share/link`, undefined, 'deleteFailed'),
  saveUploadLink: (id: number, changes: UploadLinkChanges) =>
    request<ShareInfo>('PUT', `/files/items/${id}/share/upload-link`, changes, 'saveFailed'),
  deleteUploadLink: (id: number) => request<ShareInfo>('DELETE', `/files/items/${id}/share/upload-link`, undefined, 'deleteFailed'),
  setPeople: (id: number, userIds: number[]) => request<ShareInfo>('PUT', `/files/items/${id}/share/people`, { userIds }, 'saveFailed'),
  myShares: () => request<SharedItem[]>('GET', '/files/shares', undefined, 'loadFailed'),
  sharedWithMe: () => request<SharedWithMeItem[]>('GET', '/files/shared-with-me', undefined, 'loadFailed'),
  leaveShare: (id: number) => request<unknown>('DELETE', `/files/shared-with-me/${id}`, undefined, 'deleteFailed'),
  favorites: () => request<FavoriteEntry[]>('GET', '/files/favorites', undefined, 'loadFailed'),
  setFavorite: (id: number, favorite: boolean) =>
    request<{ favorite: boolean }>(favorite ? 'PUT' : 'DELETE', `/files/items/${id}/favorite`, undefined, 'saveFailed'),


  settings: () => request<SettingsDto>('GET', '/files/settings', undefined, 'loadFailed'),
  saveSettings: (settings: SettingsDto) => request<SettingsDto>('PUT', '/files/settings', settings, 'saveFailed'),
  storage: () => request<StorageUser[]>('GET', '/files/storage', undefined, 'loadFailed'),
  setQuota: (id: number, quotaMode: StorageUser['quotaMode'], quota: number | null) =>
    request<StorageUser>('PATCH', `/files/storage/${id}`, { quotaMode, quota }, 'saveFailed'),

  publicShare: (token: string, folderId?: number | null) =>
    request<PublicShare>('GET', `/files/s/${token}${folderId ? `?folder=${folderId}` : ''}`, undefined, 'loadFailed'),
  unlock: (token: string, password: string) => request<unknown>('POST', `/files/s/${token}/unlock`, { password }, 'wrongPassword'),
  publicUploadLink: (token: string) => request<PublicUploadLink>('GET', `/files/u/${token}`, undefined, 'loadFailed'),
  unlockUploadLink: (token: string, password: string) =>
    request<unknown>('POST', `/files/u/${token}/unlock`, { password }, 'wrongPassword'),
  saveText,
  uploadConflicts: (parentId: number | null, paths: string[]) =>
    request<{ conflicts: number[] }>('POST', '/files/uploads/conflicts', { parentId, paths }, 'loadFailed'),
}

type Versioned = Pick<ItemDto, 'id' | 'updatedAt'>

/** Changes whenever the file's bytes or pictures do, so pictures can be cached by their URL. */
function version(item: Versioned): string {
  return new Date(item.updatedAt).getTime().toString(36)
}

export const urls = {
  ...suiteUrls,
  content: (id: number, download = false) => `/api/files/items/${id}/content${download ? '?download' : ''}`,
  thumbnail: (item: Versioned) => `/api/files/items/${item.id}/thumbnail?v=${version(item)}`,
  preview: (item: Versioned) => `/api/files/items/${item.id}/preview?v=${version(item)}`,
  media: (item: Versioned) => `/api/files/items/${item.id}/media?v=${version(item)}`,
  /** A video or audio file converted by the server as it plays, from `start` seconds. */
  stream: (item: Versioned, start: number) => `/api/files/items/${item.id}/stream?v=${version(item)}${start > 0 ? `&t=${start.toFixed(1)}` : ''}`,
  zip: (ids: number[], name: string) => `/api/files/zip?ids=${ids.join(',')}&name=${encodeURIComponent(name)}`,
  linkPage: (token: string) => `${window.location.origin}/s/${token}`,
  uploadPage: (token: string) => `${window.location.origin}/u/${token}`,
  linkContent: (token: string, id: number, download = false) =>
    `/api/files/s/${token}/items/${id}/content${download ? '?download' : ''}`,
  linkThumbnail: (token: string, item: Versioned) => `/api/files/s/${token}/items/${item.id}/thumbnail?v=${version(item)}`,
  linkPreview: (token: string, item: Versioned) => `/api/files/s/${token}/items/${item.id}/preview?v=${version(item)}`,
  linkMedia: (token: string, item: Versioned) => `/api/files/s/${token}/items/${item.id}/media?v=${version(item)}`,
  linkStream: (token: string, item: Versioned, start: number) =>
    `/api/files/s/${token}/items/${item.id}/stream?v=${version(item)}${start > 0 ? `&t=${start.toFixed(1)}` : ''}`,
  linkZip: (token: string, folderId?: number | null) => `/api/files/s/${token}/zip${folderId ? `?folder=${folderId}` : ''}`,
}
