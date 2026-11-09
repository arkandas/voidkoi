import type { ComponentType } from 'react';

import type { AppId } from '@/modules/types';

import FilesSettings from '@/modules/files/settings';
import NotesSettings from '@/modules/notes/settings';
import TalkSettings from '@/modules/talk/settings';

/** The apps with a page of their own in Settings. Their manifests have `settings`. */
export const SETTINGS_PAGES: Partial<Record<AppId, ComponentType>> = {
  files: FilesSettings,
  notes: NotesSettings,
  talk: TalkSettings,
};
