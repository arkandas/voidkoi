import type { AppManifest } from '@/modules/types';

/** Habits: weight, training and food. */
export const manifest: AppManifest = {
  id: 'habits',
  href: '/habits',
  subApps: [{ id: 'weight' }, { id: 'training' }, { id: 'food' }],
};
