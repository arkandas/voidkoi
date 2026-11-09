import type { AppManifest } from '@/modules/types';

/** Utilikit: converters and everyday tools, in the groups its home page shows. */
export const manifest: AppManifest = {
  id: 'utilikit',
  href: '/utilikit',
  subApps: [{ id: 'media' }, { id: 'developer' }, { id: 'design' }, { id: 'text' }, { id: 'network' }, { id: 'web' }],
};
