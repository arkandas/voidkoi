import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { Calendar, CalendarSkeleton } from '@/modules/habits/components/calendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('habits.nav');
  return { title: t('calendar') };
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <Calendar />
    </Suspense>
  );
}
