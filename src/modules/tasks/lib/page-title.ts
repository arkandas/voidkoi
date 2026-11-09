import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { appMetadata } from '@/lib/page-title'
import type { TasksPart } from '@/modules/tasks/lib/routes'

/** A part of Tasks, set from its layout: "To-do · Tasks". */
export async function tasksPart(part: TasksPart): Promise<Metadata> {
  const t = await getTranslations('tasks.app')
  return appMetadata('tasks', t(part))
}
