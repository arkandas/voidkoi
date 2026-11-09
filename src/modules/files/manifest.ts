import type { AppManifest } from '@/modules/types';

/** Files: storage and sharing. */
export const manifest: AppManifest = {
  id: 'files',
  href: '/files',
  subApps: [],
  settings: true,
  admin: true,
};
