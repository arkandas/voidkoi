'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  run(): void;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  show(message: string, tone?: ToastTone, action?: ToastAction): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICONS: Record<ToastTone, ReactNode> = {
  info: <Info size={18} className="text-ink-muted" />,
  success: <CheckCircle2 size={18} className="text-success" />,
  error: <XCircle size={18} className="text-danger" />,
};

const VISIBLE_MS = 4000;
/** Long enough to reach for the button. */
const WITH_ACTION_MS = 7000;

/** At the top: the bottom of the screen belongs to the upload panel and, on a phone, the tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const regionRef = useRef<HTMLDivElement>(null);

  // A popover, shown again for every new toast: that puts it in the top layer
  // above any dialog that is open, which would otherwise hide it.
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== 'function') return;
    try {
      if (region.matches(':popover-open')) region.hidePopover();
      if (toasts.length > 0) region.showPopover();
    } catch {}
  }, [toasts]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, message, tone, action }]);
      setTimeout(() => dismiss(id), action ? WITH_ACTION_MS : VISIBLE_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        ref={regionRef}
        popover="manual"
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] bottom-auto z-[60] m-0 flex w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 [&:not(:popover-open)]:hidden"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="upload-row pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-xl border border-line-strong bg-raised py-2 pr-2 pl-3.5 text-ink shadow-xl dark:bg-surface"
          >
            <span aria-hidden="true" className="shrink-0">
              {TONE_ICONS[toast.tone]}
            </span>
            <span className="text-sm font-medium">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
                className="ml-1 h-8 shrink-0 rounded-md px-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t('dismiss')}
              title={t('dismiss')}
              onClick={() => dismiss(toast.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-4 focus-visible:ring-line-strong"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
