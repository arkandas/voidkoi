'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import { useFilesStatus } from '@/modules/files/components/files-status';
import { FileName } from '@/modules/files/components/file-name';
import { Button, Modal } from '@/components/ui';
import { api } from '@/modules/files/lib/api';
import { fromFileList, type Picked } from '@/modules/files/lib/upload/collect';
import { uploadManager, type Target, type UploadManager, type UploadSnapshot } from '@/modules/files/lib/upload/engine';

interface UploadContextValue {
  manager: UploadManager;
  snapshot: UploadSnapshot;
  /** Where dropped and picked files go from here. Null: nowhere, this is somebody else's folder. */
  target: Target | null;
  setTarget(target: Target | null | undefined): void;
  /** Open the system's picker for files, or for a whole folder. */
  pick(kind: 'files' | 'folder'): void;
  /** Upload `picked` into `target`, asking first when some of it is already there. */
  queue(picked: Picked, target: Target): Promise<void>;
}

/** A batch waiting for an answer: some of its files are already in the folder. */
interface Pending {
  picked: Picked;
  target: Target;
  /** "report.pdf", "Photos/2026/a.jpg": the ones already there. */
  taken: string[];
}

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * One upload manager for the whole app: uploads carry on while you move
 * between pages, and the panel follows you.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('files.browser');
  const manager = useMemo(() => uploadManager(), []);
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  const { status, refresh } = useFilesStatus();
  const [override, setOverride] = useState<Target | null | undefined>(undefined);
  const home = useMemo<Target>(() => ({ id: null, label: t('title') }), [t]);
  const target = override === undefined ? home : override;
  const targetRef = useRef(target);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (status) manager.setLimits({ maxUploadBytes: status.maxUploadBytes, directMax: status.chunkSize });
  }, [manager, status]);

  // Storage used goes up as files arrive; read it again once a burst settles.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = manager.onUploaded(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 800);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [manager, refresh]);

  const pick = useCallback((kind: 'files' | 'folder') => {
    (kind === 'files' ? filesInput : folderInput).current?.click();
  }, []);

  const queue = useCallback(
    async (picked: Picked, destination: Target): Promise<void> => {
      const paths = picked.files.map(({ file, dir }) => (dir ? `${dir}/${file.name}` : file.name));
      let conflicts: number[] = [];
      if (paths.length > 0) {
        try {
          conflicts = (await api.uploadConflicts(destination.id, paths)).conflicts;
        } catch {
          // No answer: upload beside whatever is there, which never loses anything.
        }
      }
      if (conflicts.length === 0) manager.add(picked, destination);
      else setPending(current => [...current, { picked, target: destination, taken: conflicts.map(index => paths[index]!) }]);
    },
    [manager],
  );

  const answer = (choice: 'replace' | 'keep' | 'cancel'): void => {
    const first = pending[0];
    setPending(current => current.slice(1));
    if (!first || choice === 'cancel') return;
    manager.add(first.picked, first.target, { replace: choice === 'replace' });
  };

  const onPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const list = event.target.files;
    if (list && list.length > 0 && targetRef.current) void queue(fromFileList(list), targetRef.current);
    event.target.value = '';
  };

  const value = useMemo(
    () => ({ manager, snapshot, target, setTarget: setOverride, pick, queue }),
    [manager, snapshot, target, pick, queue],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      <ConflictDialog pending={pending[0] ?? null} onAnswer={answer} />
      <input ref={filesInput} type="file" multiple tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onPicked} />
      <input
        ref={folderInput}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={onPicked}
        {...({ webkitdirectory: '' } as object)}
      />
    </UploadContext.Provider>
  );
}

/** Shown names of files already there, before "and 3 more". */
const SHOWN = 5;

function ConflictDialog({ pending, onAnswer }: { pending: Pending | null; onAnswer(choice: 'replace' | 'keep' | 'cancel'): void }) {
  const t = useTranslations('files.uploads.conflict');
  const tCommon = useTranslations('common');
  const count = pending?.taken.length ?? 0;
  const title = pending ? t('title', { count, name: pending.taken[0]!, folder: pending.target.label }) : '';
  const shown = pending?.taken.slice(0, SHOWN) ?? [];

  return (
    <Modal open={pending !== null} label={title} title={title} onClose={() => onAnswer('cancel')}>
      {count > 1 ? (
        <ul className="space-y-1 text-sm text-ink">
          {shown.map(name => (
            <li key={name}>
              <FileName name={name} />
            </li>
          ))}
          {count > shown.length ? <li className="text-ink-muted">{t('more', { count: count - shown.length })}</li> : null}
        </ul>
      ) : null}
      <div className={count > 1 ? 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' : 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'}>
        <Button variant="outline" onClick={() => onAnswer('cancel')} className="w-full sm:w-auto">
          {tCommon('cancel')}
        </Button>
        <Button variant="outline" onClick={() => onAnswer('keep')} className="w-full sm:w-auto">
          {t('keepBoth')}
        </Button>
        <Button onClick={() => onAnswer('replace')} className="w-full sm:w-auto" autoFocus>
          {t('replace')}
        </Button>
      </div>
    </Modal>
  );
}

export function useUploads(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploads must be used inside an UploadProvider');
  return context;
}

/** Send drops and the Upload button to this page's folder while it is open. */
export function useUploadTarget(target: Target | null): void {
  const { setTarget } = useUploads();
  useEffect(() => {
    setTarget(target);
    return () => setTarget(undefined);
  }, [setTarget, target]);
}
