import type { AppManifest } from '@/modules/types';

/** Tasks: boards, a to-do list and sticky notes. */
export const manifest: AppManifest = {
  id: 'tasks',
  href: '/tasks',
  subApps: [{ id: 'boards' }, { id: 'todo' }, { id: 'stickies' }],
};
