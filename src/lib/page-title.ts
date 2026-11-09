import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import type { AppId } from '@/modules/types'

/** A page of the suite's own reads "<page> · voidkoi". */
export const TITLE_TEMPLATE = '%s · voidkoi'

/**
 * Settings' or Admin's title, set from its layout because its page runs in
 * the browser: "Settings", and "<page> · Settings" for the pages under it.
 */
export async function suiteMetadata(section: 'settings' | 'admin'): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: { absolute: t(section), template: `%s · ${t(section)}` } }
}

/**
 * The tab's icon while one of the app's pages is open: the koi with a dot in the app's colour, so a bookmark still
 * shows the koi. The icon on a phone's home screen stays the suite's: that is one app for all of them.
 */
export function appIcons(app: AppId): Metadata['icons'] {
  return {
    icon: [
      { url: `/favicons/${app}.svg`, type: 'image/svg+xml' },
      { url: `/favicons/${app}.png`, sizes: '64x64', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  }
}

/**
 * An app's title, set from its layout: "<page> · <app>" for the pages under it, `page` for a place in the app and
 * the app's name alone otherwise. With its icon.
 */
export async function appMetadata(app: AppId, page?: string): Promise<Metadata> {
  const t = await getTranslations()
  const name = t(`${app}.app.name`)
  const template = `%s · ${name}`
  return { title: page ? { default: page, template } : { absolute: name, template }, icons: appIcons(app) }
}

/**
 * The title of the page that sits beside an app's layout, its first page: "<page> · <app>". The layout's pattern
 * only reaches the pages under it, so this one spells it out.
 */
export async function appPageTitle(app: AppId, page: string): Promise<Metadata['title']> {
  const t = await getTranslations()
  return { absolute: `${page} · ${t(`${app}.app.name`)}` }
}
