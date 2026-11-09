import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { appMetadata } from '@/lib/page-title'

export type FilesSection = 'favorites' | 'shared' | 'sharedWithMe' | 'trash'

/** A place in Files, set from its layout: "Favorites · Files". */
export async function filesSection(section: FilesSection): Promise<Metadata> {
  const t = await getTranslations('files.nav')
  return appMetadata('files', t(section))
}
