import type { ReactNode } from 'react';

import { requireAppPage } from '@/lib/app-access';
import { tasksPart } from '@/modules/tasks/lib/page-title';

export const generateMetadata = () => tasksPart('stickies');

export default async function StickyNotesLayout({ children }: { children: ReactNode }) {
  await requireAppPage('tasks', 'stickies');
  return children;
}
