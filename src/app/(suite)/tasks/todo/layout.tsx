import type { ReactNode } from 'react';

import { requireAppPage } from '@/lib/app-access';
import { tasksPart } from '@/modules/tasks/lib/page-title';

export const generateMetadata = () => tasksPart('todo');

export default async function TodoLayout({ children }: { children: ReactNode }) {
  await requireAppPage('tasks', 'todo');
  return children;
}
