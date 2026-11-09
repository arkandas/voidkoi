import { notFound } from 'next/navigation'
import { wikiContext, type WikiContext } from '@/modules/wiki/lib/wiki'

/** A page for editors: the wiki's layout has already signed the account in. Readers find nothing there. */
export async function editorOrNotFound(): Promise<WikiContext & { user: NonNullable<WikiContext['user']> }> {
  const context = await wikiContext()
  if (!context.user || !context.reader.editor) notFound()
  return context as WikiContext & { user: NonNullable<WikiContext['user']> }
}
