'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { createFormat } from './format'

/** Numbers, durations and days in the reader's language. */
export function useFormat() {
  const locale = useLocale()
  const t = useTranslations('habits.format')
  return useMemo(
    () =>
      createFormat(locale, {
        minutes: m => t('minutes', { m }),
        hours: h => t('hours', { h }),
        hoursMinutes: (h, m) => t('hoursMinutes', { h, m }),
        today: t('today'),
        yesterday: t('yesterday'),
        tomorrow: t('tomorrow'),
        daysAgo: n => t('daysAgo', { n }),
        inDays: n => t('inDays', { n }),
      }),
    [locale, t],
  )
}
