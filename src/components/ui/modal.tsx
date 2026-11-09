'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/cn';

export type ModalSize = 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  /** 'lg' fits a picker or a form with sections. */
  size?: ModalSize;
  /** Called on Escape and on backdrop click. Omit to make the modal sticky. */
  onClose?: () => void;
  /** Names the dialog for screen readers. */
  label: string;
  /** Drawn in the header band, with a close button beside it. */
  title?: string;
  children: ReactNode;
  className?: string;
  /** Off for content that sets its own padding. */
  padded?: boolean;
  /** Escape and backdrop clicks are ignored, e.g. while saving. */
  dismissible?: boolean;
}

const SIZES: Record<ModalSize, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
};

/** Whether a scrolling area has more to show above and below what is in view. */
function useOverflow(scroller: RefObject<HTMLDivElement | null>, content: RefObject<HTMLDivElement | null>) {
  const [overflow, setOverflow] = useState({ above: false, below: false });

  useEffect(() => {
    const element = scroller.current;
    const inner = content.current;
    if (!element || !inner) return;
    const measure = (): void => {
      const above = element.scrollTop > 0;
      const below = element.scrollHeight - element.clientHeight - element.scrollTop > 1;
      setOverflow(current => (current.above === above && current.below === below ? current : { above, below }));
    };
    element.addEventListener('scroll', measure, { passive: true });
    // It reports each element once as it starts watching, which takes the first measure.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(inner);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scroller, content]);

  return overflow;
}

/**
 * Built on the native `<dialog>` element: focus trapping, the top layer, the
 * backdrop and Escape all come from the platform rather than from us. Drawn
 * like the dialogs in the other apps: a raised header band over the body.
 * When the window is too short for it, only the body scrolls, with no bar
 * beside it: the header stays put and the bottom edge fades while there is
 * more below.
 */
export function Modal({
  open,
  size = 'md',
  onClose,
  label,
  title,
  children,
  className,
  padded = true,
  dismissible = true,
}: ModalProps) {
  const t = useTranslations('common');
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const overflow = useOverflow(body, content);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      body.current?.scrollTo(0, 0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const onCancel = (event: Event): void => {
      // `cancel` fires on Escape. Prevent the default close so React stays the
      // single source of truth for whether the modal is open.
      event.preventDefault();
      if (dismissible) onClose?.();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      // The backdrop comes from the base layer in globals.css; a `backdrop:`
      // utility here would sit in a higher layer and win.
      className={cn('m-auto w-full p-4', SIZES[size])}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a backdrop click:
        // the panel below stops its own clicks from reaching here.
        if (dismissible && event.target === ref.current) onClose?.();
      }}
    >
      <div
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden',
          'rounded-2xl border border-line-strong bg-surface shadow-2xl',
          className,
        )}
      >
        {title ? (
          <div
            className={cn(
              'relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-raised px-4 py-3 transition-shadow sm:px-6 sm:py-4',
              overflow.above && 'shadow-[0_10px_18px_-14px_rgb(0_0_0/0.45)]',
            )}
          >
            <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
            {dismissible && onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                className="-mr-2 flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-4 focus-visible:ring-line-strong"
              >
                <X size={18} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div ref={body} className="scrollbar-hidden min-h-0 overflow-y-auto overscroll-contain">
          <div ref={content} className={padded ? 'p-4 sm:p-6' : undefined}>
            {children}
          </div>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-surface to-transparent transition-opacity duration-200',
            overflow.below ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
    </dialog>
  );
}
