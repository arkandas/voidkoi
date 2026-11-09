import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CallsPage } from '@/modules/talk/components/pages/calls';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('talk.nav');
  return { title: t('calls') };
}

export default function TalkCallsPage() {
  return <CallsPage />;
}
