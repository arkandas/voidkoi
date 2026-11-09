import type { ReactNode } from 'react';

import { requireAppPage } from '@/lib/app-access';
import { BoardsFrame } from '@/modules/tasks/components/boards/boards-frame';
import { tasksPart } from '@/modules/tasks/lib/page-title';

export const generateMetadata = () => tasksPart('boards');

export default async function BoardsLayout({ children }: { children: ReactNode }) {
  await requireAppPage('tasks', 'boards');
  return <BoardsFrame>{children}</BoardsFrame>;
}
