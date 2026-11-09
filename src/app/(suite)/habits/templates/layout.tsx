import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { requireAppPage } from '@/lib/app-access';
import { tracksOf } from '@/modules/habits/lib/tracks';

/** Saved meals and workouts: for an account that logs food or training. */
export default async function TemplatesLayout({ children }: { children: ReactNode }) {
  const user = await requireAppPage('habits');
  const tracks = tracksOf(user.apps);
  if (!tracks.food && !tracks.training) redirect('/habits');
  return children;
}
