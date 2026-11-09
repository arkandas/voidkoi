'use client';

import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  onSelect(): void;
  /** Destroys something: drawn in red, after a line. */
  danger?: boolean;
  hidden?: boolean;
}

export interface ActionMenuProps {
  /** Names the trigger, e.g. "Actions for report.pdf". */
  label: string;
  actions: MenuAction[];
  /** What the trigger looks like. */
  children: ReactNode;
  triggerClassName?: string;
}

/** Between the trigger and the menu. */
const GAP = 6;
/** The least the menu keeps from the edges of the window. */
const EDGE = 8;

/**
 * A list of things to do with something, opened from a button. It floats over
 * the page, so a card or a scrolling list can't cut it off: below the trigger,
 * or above it when there is no room below, and always inside the window.
 * Arrows move, Escape closes, and focus goes back to the trigger. Scrolling
 * closes it, since it would otherwise drift away from its button.
 */
export function ActionMenu({ label, actions, children, triggerClassName }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const shown = actions.filter((action) => !action.hidden);

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // Placed before it is painted, so it never shows up in the wrong spot first.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!open || !menu || !trigger) return;
    // The top layer: over every card, scrolling list and dialog.
    if (typeof menu.showPopover === 'function') {
      try {
        menu.showPopover();
      } catch {}
    }
    const place = (): void => {
      const box = trigger.getBoundingClientRect();
      const below = window.innerHeight - box.bottom;
      const above = below < menu.offsetHeight + GAP + EDGE && box.top > below;
      const top = above ? box.top - GAP - menu.offsetHeight : box.bottom + GAP;
      const left = Math.min(box.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - EDGE);
      menu.style.top = `${Math.max(EDGE, top)}px`;
      menu.style.left = `${Math.max(EDGE, left)}px`;
    };
    place();
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });

    const onScroll = (event: Event): void => {
      if (!menu.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const move = (by: number): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + by + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-muted hover:text-ink',
          'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-line-strong',
          triggerClassName,
        )}
      >
        {children}
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          popover="manual"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Tab') {
              close(false);
            }
          }}
          className="fixed inset-auto z-50 m-0 min-w-52 rounded-xl border border-line-strong bg-raised p-1 text-ink shadow-xl dark:bg-surface"
        >
          {shown.map((action, index) => {
            const Icon = action.icon;
            const divider = action.danger && index > 0 && !shown[index - 1]!.danger;
            return (
              <div key={action.label}>
                {divider ? <div className="my-1 h-px bg-line" /> : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(true);
                    action.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-hidden',
                    action.danger
                      ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
                      : 'text-ink hover:bg-muted focus-visible:bg-muted',
                  )}
                >
                  <Icon size={16} aria-hidden="true" className={action.danger ? 'text-danger' : 'text-ink-muted'} />
                  {action.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
