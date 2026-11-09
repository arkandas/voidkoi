import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ToolId } from '@/modules/utilikit/lib/tools';

/** A tool's page title, "<tool> · Utilikit" through the app's template, and its description. */
export async function toolMetadata(id: ToolId): Promise<Metadata> {
  const t = await getTranslations('utilikit.tools');
  return {
    title: t(`${id}.name`),
    description: t(`${id}.description`),
  };
}
