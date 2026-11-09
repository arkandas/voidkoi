import type { AppManifest } from '@/modules/types';

/** Wiki: one wiki everyone who uses it shares, of folders and pages, some of them public. */
export const manifest: AppManifest = {
  id: 'wiki',
  href: '/wiki',
  subApps: [],
  admin: true,
};
