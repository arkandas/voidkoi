import { BookOpen, FileQuestion } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { EmptyState } from '@/components/ui';
import { urls } from '@/modules/wiki/lib/api';
import { getSettings } from '@/modules/wiki/lib/settings';

import { WikiPage } from './frame';
import { WikiHeader } from './page-header';

/** An address that names nothing this reader may see, and the way to the wiki's start. */
export async function NotFoundPage() {
  const [t, settings] = await Promise.all([getTranslations('wiki.notFound'), getSettings()]);
  return (
    <WikiPage header={<WikiHeader icon={<BookOpen size={18} />} title={settings.wiki_name} />}>
      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <EmptyState
          icon={<FileQuestion size={24} />}
          title={t('title')}
          action={
            <Link
              href={urls.page('')}
              className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-muted"
            >
              {t('home')}
            </Link>
          }
        />
      </div>
    </WikiPage>
  );
}
