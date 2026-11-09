'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { NoticeWords } from '../groups';

/** The `talk.chat.notice` words in the page's language, for the helpers in lib/groups. */
export function useNoticeWords(): NoticeWords {
  const t = useTranslations('talk.chat.notice');
  return useCallback<NoticeWords>((key, values) => t(key, values), [t]);
}
