/** The JSON Files' API speaks. Shared by its route handlers and its pages. */

import type { PersonDto } from '@/lib/api-types'

export type { PersonDto, Role } from '@/lib/api-types'
export type LinkAccessDto = 'public' | 'users'

export interface ItemDto {
  id: number
  kind: 'folder' | 'file'
  name: string
  size: number
  mime: string | null
  parentId: number | null
  createdAt: string
  updatedAt: string
  hasThumbnail: boolean
  /** A WebP copy for the viewer, of an image the browser can't show. */
  hasPreview: boolean
  width: number | null
  height: number | null
  /** Folders in a listing: how many things are inside. */
  childCount?: number
  /** Owner listings: how it is shared. */
  link?: LinkAccessDto | null
  people?: number
  /** Owner listings: a folder people can upload to through a link. */
  uploadLink?: boolean
  /** Starred by whoever is looking. */
  favorite?: boolean
}

/** What the player knows about a video or audio file before playing it. */
export interface MediaInfoDto {
  /** False when the server can't read it, like without ffmpeg. */
  playable: boolean
  /** The browser plays the file as it is; otherwise it plays through the server. */
  direct?: boolean
  duration?: number | null
  video?: { width: number; height: number } | null
  /** The type of the server's stream, codecs included. */
  stream?: string
  title?: string | null
  artist?: string | null
  album?: string | null
}

export interface Crumb {
  id: number | null
  name: string
}

export interface FolderListing {
  /** Null for the top of My files. */
  folder: ItemDto | null
  crumbs: Crumb[]
  role: 'owner' | 'viewer'
  /** Who shared it, when this is somebody else's folder. */
  owner: PersonDto | null
  items: ItemDto[]
}

export interface ItemDetail {
  item: ItemDto
  crumbs: Crumb[]
  role: 'owner' | 'viewer'
  owner: PersonDto | null
}

export interface LinkDto {
  token: string
  access: LinkAccessDto
  hasPassword: boolean
  expiresAt: string | null
  maxDownloads: number | null
  downloads: number
  createdAt: string
}

/** A link through which people without an account put files in a folder. */
export interface UploadLinkDto {
  token: string
  hasPassword: boolean
  expiresAt: string | null
  /** Files that came in through it. */
  received: number
  createdAt: string
  /** What its folder holds now, subfolders included. */
  folderSize: number
  /** The administrator's limit on that, null for none. */
  folderLimit: number | null
}

export interface ShareInfo {
  link: LinkDto | null
  /** Folders only. */
  uploadLink: UploadLinkDto | null
  people: PersonDto[]
}

export interface SharedItem {
  item: ItemDto
  link: LinkDto | null
  uploadLink: UploadLinkDto | null
  people: PersonDto[]
  /** Where it is in My files, e.g. "Documents / Taxes". Empty at the top. */
  location: string
}

export interface SharedWithMeItem {
  item: ItemDto
  owner: PersonDto
  sharedAt: string
}

export interface FavoriteEntry {
  item: ItemDto
  /** Who it belongs to, when it was shared with you. */
  owner: PersonDto | null
  /** Where your own item is in My files, e.g. "Documents / Taxes". Empty at the top. */
  location: string
}

export interface TrashEntry {
  item: ItemDto
  deletedAt: string
  /** The folder it was deleted from, null for the top of My files. */
  from: string | null
  /** Everything it held, for a folder. */
  size: number
}

export interface UploadSession {
  id: string
  chunkSize: number
  received: number[]
}

export interface SearchResult {
  item: ItemDto
  location: string
}

/** How much an account keeps in Files, and what limits it. */
export interface FilesStatusDto {
  usage: number
  quota: number | null
  maxUploadBytes: number | null
  chunkSize: number
  /** Shared with this account since it last opened Shared with me. */
  newShares: number
  /** The disk files are kept on: what the usage is measured against when there is no limit. */
  disk: { total: number; free: number } | null
}

/** An account's storage, for the administrator. */
export interface StorageUser {
  id: number
  username: string
  avatar: string | null
  usage: number
  quotaMode: 'default' | 'custom' | 'unlimited'
  quota: number | null
}

export interface SettingsDto {
  maxUploadBytes: number | null
  defaultQuotaBytes: number | null
  /** The most a folder with an upload link can hold before the link takes no more files. */
  uploadLinkMaxBytes: number | null
}

/** What a share link shows to whoever opens it. */
export type PublicShare =
  | { state: 'notFound' | 'expired' | 'usedUp' }
  | { state: 'signIn' | 'password'; owner: string }
  | {
      state: 'ok'
      owner: PersonDto
      expiresAt: string | null
      root: ItemDto
      /** The folder being looked at, for a shared folder. */
      folder: ItemDto | null
      crumbs: Crumb[]
      items: ItemDto[]
    }

/** What an upload link shows to whoever opens it. */
export type PublicUploadLink =
  | { state: 'notFound' | 'expired' }
  | { state: 'password'; owner: string }
  | {
      state: 'ok'
      owner: PersonDto
      /** The name of the folder files go in. */
      folder: string
      expiresAt: string | null
      maxUploadBytes: number | null
      chunkSize: number
    }
