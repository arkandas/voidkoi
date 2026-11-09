'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Confirm, useToast } from '@/components/ui';
import { fromFileList } from '@/modules/files/lib/upload/collect';
import { takeSharedFiles } from '@/modules/files/lib/upload/shared-in';

import { useUploads } from './upload-provider';

/**
 * Files shared into the app from another one (the share sheet, on Android)
 * go up to My files like anything dropped there, once the person says so: a
 * page on another site could post files to the share target too. Also starts
 * the service worker that receives them.
 */
export function SharedIn() {
  const t = useTranslations('files.browser');
  const tUploads = useTranslations('files.uploads');
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { queue } = useUploads();
  const taken = useRef(false);
  const [offered, setOffered] = useState<File[] | null>(null);
  const shared = params.get('shared');

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!shared || taken.current) return;
    taken.current = true;
    router.replace(pathname);
    if (shared === 'failed') {
      toast.show(tUploads('sharedFailed'), 'error');
      return;
    }
    void takeSharedFiles()
      .then(files => {
        if (files.length > 0) setOffered(files);
      })
      .catch(() => toast.show(tUploads('sharedFailed'), 'error'));
  }, [shared, router, pathname, toast, tUploads]);

  const names = offered?.slice(0, 5).map(file => file.name) ?? [];
  const more = (offered?.length ?? 0) - names.length;

  return (
    <Confirm
      open={offered !== null}
      title={tUploads('sharedTitle', { count: offered?.length ?? 0 })}
      confirmLabel={tUploads('sharedConfirm')}
      onConfirm={() => {
        if (offered) void queue(fromFileList(offered), { id: null, label: t('title') });
        setOffered(null);
      }}
      onCancel={() => setOffered(null)}
    >
      <ul className="space-y-1 text-sm">
        {names.map((name, index) => (
          <li key={index} className="truncate font-medium text-ink">
            {name}
          </li>
        ))}
        {more > 0 ? <li>{tUploads('more', { count: more })}</li> : null}
      </ul>
    </Confirm>
  );
}
