'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface MenuChoice {
  value: string;
  label: string;
  /** Drawn before an action's label. A choice menu shows a check there instead. */
  icon?: LucideIcon;
  /** Destroys something: drawn in red. */
  danger?: boolean;
  /** Smaller second line for a state, like a device that is unplugged. */
  detail?: string;
  disabled?: boolean;
}

export interface ChoiceMenuProps {
  /** Names the menu for assistive technology, e.g. "Change microphone". */
  label: string;
  choices: readonly MenuChoice[];
  value: string;
  onChoose(value: string): void;
  /** Rendered as the thing that opens the menu. */
  children: ReactNode;
  /** Which edge the panel is pinned to. */
  align?: 'start' | 'end';
  /** Above the trigger by default, because these sit in a bottom control bar. */
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * A single-choice popup menu, like the microphone list beside a call control.
 *
 * Rolled by hand rather than reaching for a native `<select>` because it opens
 * over a video call, where the operating system's picker would be an opaque
 * rectangle in the middle of the person you are talking to.
 *
 * That means owning the keyboard contract: arrows move, Home and End jump,
 * Escape closes without choosing, and focus always returns to the trigger so
 * tabbing does not restart at the top of the page.
 */
export function ChoiceMenu({
  label,
  choices,
  value,
  onChoose,
  children,
  align = 'start',
  side = 'top',
  className,
}: ChoiceMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const enabled = choices.filter((choice) => !choice.disabled);

  const close = (returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // Pointer down rather than click: a click that lands on a button elsewhere
  // would otherwise fire before the menu had closed.
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

  // Moving focus is the point of opening a menu, so this is a DOM command
  // rather than state: the item that should be focused just gets focused.
  useEffect(() => {
    if (open) itemsRef.current[active]?.focus();
  }, [open, active]);

  const openAt = (index: number): void => {
    setActive(Math.max(0, index));
    setOpen(true);
  };

  const currentIndex = (): number => {
    const found = choices.findIndex((choice) => choice.value === value);
    return found === -1 ? 0 : found;
  };

  const step = (from: number, by: number): number => {
    if (enabled.length === 0) return from;
    let index = from;
    for (let hops = 0; hops < choices.length; hops += 1) {
      index = (index + by + choices.length) % choices.length;
      if (!choices[index]?.disabled) return index;
    }
    return from;
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(currentIndex()))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            openAt(currentIndex());
          }
        }}
        className="inline-flex items-center justify-center rounded-lg focus:outline-hidden focus-visible:ring-4 focus-visible:ring-line-strong"
      >
        {children}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => step(index, 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => step(index, -1));
            } else if (event.key === 'Home') {
              event.preventDefault();
              setActive(step(choices.length - 1, 1));
            } else if (event.key === 'End') {
              event.preventDefault();
              setActive(step(0, -1));
            } else if (event.key === 'Tab') {
              close(false);
            }
          }}
          className={cn(
            'absolute z-50 min-w-60 rounded-xl border border-line-strong bg-raised p-1 shadow-xl dark:bg-surface',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'start' ? 'left-0' : 'right-0',
          )}
        >
          {choices.map((choice, index) => {
            const chosen = choice.value === value;
            return (
              <button
                key={choice.value}
                ref={(element) => {
                  itemsRef.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                disabled={choice.disabled}
                tabIndex={index === active ? 0 : -1}
                onClick={() => {
                  onChoose(choice.value);
                  close(true);
                }}
                onFocus={() => setActive(index)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left',
                  'transition-colors duration-150 focus:outline-hidden',
                  choice.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-muted focus-visible:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center',
                    choice.icon ? (choice.danger ? 'text-danger' : 'text-ink-muted') : 'text-accent',
                  )}
                >
                  {choice.icon ? (
                    <choice.icon size={16} aria-hidden="true" />
                  ) : chosen ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium',
                      choice.danger ? 'text-danger' : 'text-ink',
                    )}
                  >
                    {choice.label}
                  </span>
                  {choice.detail ? (
                    <span className="block truncate text-xs text-ink-muted">{choice.detail}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
