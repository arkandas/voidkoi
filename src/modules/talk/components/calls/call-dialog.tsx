'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type CallDialogSize = 'md' | 'lg' | 'stage';

const SIZES: Record<CallDialogSize, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  // The wide layout a video call needs.
  stage: 'sm:max-w-5xl',
};

/**
 * The call screen: a native `<dialog>` in the top layer, over every page,
 * that Escape and a click outside never close. Hanging up does.
 */
export function CallDialog({ open, size = 'md', label, className, children }: { open: boolean; size?: CallDialogSize; label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Escape would close it behind React's back; a call ends by hanging up.
    const onCancel = (event: Event): void => event.preventDefault();
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog ref={ref} aria-label={label} className={cn('m-auto w-full p-4', SIZES[size])}>
      <div className={cn('themed-scroll max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-surface shadow-2xl', className)}>
        {children}
      </div>
    </dialog>
  );
}
