import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appPageTitle } from '@/lib/page-title';

import { ChatsPage } from '@/modules/talk/components/pages/chats';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('talk.nav');
  return { title: await appPageTitle('talk', t('chats')) };
}

export default function TalkChatsPage() {
  return <ChatsPage />;
}
