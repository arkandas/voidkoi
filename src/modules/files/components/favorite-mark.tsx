'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ItemDto } from '@/modules/files/lib/api-types';

/** A star after a favorite's name. */
export function FavoriteMark({ item }: { item: Pick<ItemDto, 'favorite'> }) {
  const t = useTranslations('files.browser');
  if (!item.favorite) return null;
  return (
    <span title={t('favorite')} className="shrink-0 text-star">
      <Star size={13} fill="currentColor" aria-hidden="true" />
      <span className="sr-only">{t('favorite')}</span>
    </span>
  );
}
