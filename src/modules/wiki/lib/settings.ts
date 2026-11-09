import bcrypt from 'bcryptjs'
import type { WikiSettings as Settings } from '@/generated/prisma/client'
import type { EffectiveVisibility, WikiAdminSettingsDto, WikiSettingsDto } from '@/modules/wiki/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'
import { ancestry, type WikiIndex } from '@/modules/wiki/lib/tree'

export async function getSettings(): Promise<Settings> {
  const found = await prisma.wikiSettings.findUnique({ where: { id: 1 } })
  if (found) return found
  // The first requests on a new database make the row, often several at once: the others find it made.
  await prisma.wikiSettings.createMany({ data: [{ id: 1 }], skipDuplicates: true })
  return prisma.wikiSettings.findUniqueOrThrow({ where: { id: 1 } })
}

export function rootVisibility(settings: Settings): EffectiveVisibility {
  const value = settings.root_visibility.toLowerCase()
  return value === 'public' || value === 'password' ? value : 'private'
}

/** For Admin: the settings, and every published page that could open the wiki. */
export function toAdminSettingsDto(settings: Settings, index: WikiIndex): WikiAdminSettingsDto {
  const pages = index.order
    .filter(entry => entry.node.kind === 'PAGE' && entry.node.published_revision_id !== null)
    .map(entry => ({ id: entry.node.id, label: ancestry(entry).map(each => each.node.title).join(' / ') }))
  return { ...toSettingsDto(settings), pages }
}

export function toSettingsDto(settings: Settings): WikiSettingsDto {
  return {
    name: settings.wiki_name,
    homePageId: settings.home_page_id,
    rootVisibility: rootVisibility(settings),
    hasRootPassword: settings.root_password_hash !== null,
    allowIndexing: settings.allow_indexing,
  }
}

export interface SettingsInput {
  name: string
  homePageId: number | null
  rootVisibility: EffectiveVisibility
  /** A new password for the wiki, when it is set to Password. Undefined keeps the one it has. */
  password?: string
  allowIndexing: boolean
}

/** Save the wiki's own settings. A home page must be a page that isn't in the trash. */
export async function saveSettings(input: SettingsInput): Promise<Settings> {
  const current = await getSettings()
  if (input.homePageId !== null) {
    const page = await prisma.wikiNode.findUnique({ where: { id: input.homePageId }, select: { kind: true, deleted_at: true } })
    if (!page || page.deleted_at || page.kind !== 'PAGE') throw new ApiError('notFound', 404)
  }
  let root_password_hash: string | null = null
  if (input.rootVisibility === 'password') {
    if (input.password) root_password_hash = await bcrypt.hash(input.password, 10)
    else if (current.root_password_hash) root_password_hash = current.root_password_hash
    else throw new ApiError('passwordRequired', 400)
  }
  return prisma.wikiSettings.update({
    where: { id: 1 },
    data: {
      wiki_name: input.name,
      home_page_id: input.homePageId,
      root_visibility: input.rootVisibility.toUpperCase() as Settings['root_visibility'],
      root_password_hash,
      allow_indexing: input.allowIndexing,
    },
  })
}
