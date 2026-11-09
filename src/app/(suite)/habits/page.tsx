import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appPageTitle } from '@/lib/page-title';

import { Overview } from '@/modules/habits/components/overview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('habits.nav');
  return { title: await appPageTitle('habits', t('overview')) };
}

export default function OverviewPage() {
  return <Overview />;
}
