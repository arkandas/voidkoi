'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { entriesOf, fromEntries, fromFileList, type Picked } from '@/modules/files/lib/upload/collect';
import type { Target } from '@/modules/files/lib/upload/engine';

import { useUploads } from './upload-provider';

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Drop files or folders anywhere on the page. While something is dragged in
 * from outside, the page says where it will go. Null `target`: nowhere here.
 */
export function DropOverlay({ target, onDrop }: { target: Target | null; onDrop(picked: Picked, target: Target): void }) {
  const t = useTranslations('files.drop');
  const [visible, setVisible] = useState(false);
  const targetRef = useRef(target);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    targetRef.current = target;
    onDropRef.current = onDrop;
  }, [target, onDrop]);

  useEffect(() => {
    // dragenter and dragleave fire for every element crossed; count them.
    let depth = 0;

    const enter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setVisible(true);
    };
    const over = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = targetRef.current ? 'copy' : 'none';
    };
    const leave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setVisible(false);
    };
    const drop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setVisible(false);
      const destination = targetRef.current;
      if (!destination || !event.dataTransfer) return;
      // The entries have to be taken now: the browser empties the drop once this returns.
      const entries = entriesOf(event.dataTransfer);
      const files = event.dataTransfer.files;
      void (entries ? fromEntries(entries) : Promise.resolve(fromFileList(files))).then(picked => {
        if (picked.files.length > 0 || picked.dirs.length > 0) onDropRef.current(picked, destination);
      });
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="drop-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="drop-frame absolute inset-3 rounded-3xl sm:inset-5" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        {target ? (
          <>
            <span className="drop-badge flex size-20 items-center justify-center rounded-3xl bg-accent text-accent-ink">
              <Upload size={36} strokeWidth={2.2} />
            </span>
            <p className="mt-2 text-xl font-bold text-ink">{t('title', { folder: target.label })}</p>
          </>
        ) : (
          <>
            <span className="flex size-20 items-center justify-center rounded-3xl bg-muted text-ink-muted">
              <Upload size={36} />
            </span>
            <p className="mt-2 text-xl font-bold text-ink">{t('notHere')}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Drops in the app go to the folder that is open, asking first about files already there. */
export function AppDropOverlay() {
  const { queue, target } = useUploads();
  return <DropOverlay target={target} onDrop={(picked, destination) => void queue(picked, destination)} />;
}
