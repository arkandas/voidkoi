'use client';

import { FilePlus2, FolderPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui';

import { useWiki } from './wiki-provider';

/** New page and New folder, for an empty folder or an empty wiki. Editors only. */
export function NewHere({ parentId }: { parentId: number | null }) {
  const t = useTranslations('wiki.folder');
  const { canEdit, open } = useWiki();
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button icon={<FilePlus2 size={16} />} onClick={() => open({ kind: 'create', nodeKind: 'page', parentId })}>
        {t('newPage')}
      </Button>
      <Button variant="outline" icon={<FolderPlus size={16} />} onClick={() => open({ kind: 'create', nodeKind: 'folder', parentId })}>
        {t('newFolder')}
      </Button>
    </div>
  );
}
