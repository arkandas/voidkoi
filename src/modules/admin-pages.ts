import type { ComponentType } from 'react';

import type { AppId } from '@/modules/types';

import FilesAdmin from '@/modules/files/admin';
import WikiAdmin from '@/modules/wiki/admin';

/** The apps with a page of their own in Admin. Their manifests have `admin`. */
export const ADMIN_PAGES: Partial<Record<AppId, ComponentType>> = {
  files: FilesAdmin,
  wiki: WikiAdmin,
};
