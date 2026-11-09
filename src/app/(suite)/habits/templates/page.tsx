import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Templates } from '@/modules/habits/components/templates';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('habits.nav');
  return { title: t('templates') };
}

export default function TemplatesPage() {
  return <Templates />;
}
