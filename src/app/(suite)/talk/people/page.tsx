import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PeoplePage } from '@/modules/talk/components/pages/people';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('talk.nav');
  return { title: t('people') };
}

export default function TalkPeoplePage() {
  return <PeoplePage />;
}
