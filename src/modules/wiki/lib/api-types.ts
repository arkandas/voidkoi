import type { PersonDto } from '@/lib/api-types'

export type { PersonDto }

export type KindDto = 'folder' | 'page'
/** What a page or folder says about who can read it. */
export type VisibilityDto = 'inherit' | 'public' | 'private' | 'password'
/** What it comes to once Inherit is followed up the tree. */
export type EffectiveVisibility = Exclude<VisibilityDto, 'inherit'>

/** One row of the sidebar's tree, in reading order. */
export interface TreeNodeDto {
  id: number
  kind: KindDto
  parentId: number | null
  title: string
  path: string
  /** A password page this visitor hasn't unlocked yet. */
  locked: boolean
  /** For editors: unpublished changes. */
  draft: boolean
  /** For editors: never published, so only editors see it. */
  unpublished: boolean
  /** For editors: its own setting. */
  visibility: VisibilityDto
  effective: EffectiveVisibility
}

export interface WikiDto {
  name: string
  homePageId: number | null
  allowIndexing: boolean
}

/** A page as the editor needs it: its draft (or published text) and its settings. */
export interface PageDetail {
  id: number
  kind: KindDto
  parentId: number | null
  title: string
  slug: string
  path: string
  visibility: VisibilityDto
  hasPassword: boolean
  effective: EffectiveVisibility
  /** What Inherit gives here: the setting of the folder above, or the wiki's. */
  inherits: EffectiveVisibility
  /** The folder Inherit takes it from, or null for the wiki. */
  inheritedFrom: string | null
  isHome: boolean
  published: {
    number: number
    title: string
    content: string
    at: string
    by: PersonDto | null
  } | null
  draft: {
    title: string
    content: string
    at: string
    by: PersonDto | null
  } | null
  /** The draft version this was read at, for saving over it. */
  version: number
}

export interface DraftSaved {
  version: number
  at: string
}

/** Someone else saved the draft since it was opened. */
export interface DraftConflict {
  error: 'editConflict'
  title: string
  content: string
  version: number
  by: PersonDto | null
  at: string
}

export interface RevisionDto {
  id: number
  number: number
  title: string
  message: string | null
  author: PersonDto | null
  createdAt: string
  published: boolean
}

export interface RevisionDetail extends RevisionDto {
  content: string
}

export interface SearchResult {
  id: number
  kind: KindDto
  title: string
  path: string
  /** Text around the match, the match itself between ‹ and ›. */
  snippet: string | null
  locked: boolean
}

export interface TrashEntry {
  id: number
  kind: KindDto
  title: string
  /** Where it was: the folder's title, or null for the top level. */
  from: string | null
  deletedAt: string
  /** Pages and folders inside it that went with it. */
  inside: number
}

/** An account that uses the wiki, as Admin lists it: whether it may write. Admins always may. */
export interface WikiMemberDto extends PersonDto {
  admin: boolean
  editor: boolean
}

export interface WikiSettingsDto {
  name: string
  homePageId: number | null
  rootVisibility: EffectiveVisibility
  hasRootPassword: boolean
  allowIndexing: boolean
}

/** The settings as Admin opens them, with the pages that can be the start page: published ones, by where they are. */
export interface WikiAdminSettingsDto extends WikiSettingsDto {
  pages: Array<{ id: number; label: string }>
}

export interface ImageDto {
  url: string
  width: number
  height: number
}
