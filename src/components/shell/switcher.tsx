'use client';

import { ChevronDown, LogOut, Settings, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { AppIcon, Mark } from '@/components/brand/mark';
import { useMe } from '@/components/me';
import { cn } from '@/lib/cn';
import { signOutFully } from '@/lib/sign-out';

import { useApps } from './use-apps';
import { badgeLabel } from './use-badges';

/** Between the button and the list. */
const GAP = 12;
/** The least the list keeps from the edges of the window. */
const EDGE = 8;

const row = 'flex w-full items-center gap-3 rounded-[10px] px-2.5 text-left transition-colors focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25';

/**
 * On a phone, where there is no rail: the open app's icon with an arrow, at
 * the start of a page's header. It drops a list under the header with every
 * app, Settings and signing out. The list floats over the page, in the top
 * layer. Arrows move, Escape closes, and focus goes back to the button.
 * Scrolling the page closes it.
 */
export function AppSwitcher({ className }: { className?: string }) {
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const me = useMe();
  const apps = useApps();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const listId = useId();
  const current = apps.find(app => app.current);
  const elsewhere = apps.some(app => !app.current && app.badge > 0);

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
        setOpen(false);
        triggerRef.current?.focus();
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
    const list = listRef.current;
    const trigger = triggerRef.current;
    if (!open || !list || !trigger) return;
    if (typeof list.showPopover === 'function') {
      try {
        list.showPopover();
      } catch {}
    }
    const place = (): void => {
      const top = trigger.getBoundingClientRect().bottom + GAP;
      list.style.top = `${top}px`;
      list.style.left = `${EDGE}px`;
      list.style.maxHeight = `${window.innerHeight - top - EDGE}px`;
    };
    place();
    list.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });

    const onScroll = (event: Event): void => {
      if (!list.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const move = (by: number): void => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('a, button') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + by + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className={cn('relative shrink-0 lg:hidden', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-label={t('switchApp')}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={cn(
          'relative flex h-9 w-14 items-center justify-center gap-0.5 rounded-xl border border-line-strong bg-raised pr-[5px] pl-[3px] text-ink-muted transition-colors',
          'hover:bg-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/30',
        )}
      >
        {current ? <AppIcon app={current.id} size={28} className="rounded-[7px]" /> : <Mark size={28} />}
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" />
        {elsewhere ? <span aria-hidden="true" className="absolute -top-1 -right-1 size-3 rounded-full bg-danger ring-2 ring-surface" /> : null}
      </button>

      {open ? (
        <nav
          ref={listRef}
          id={listId}
          aria-label={t('apps')}
          popover="manual"
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
          className="fixed inset-auto z-50 m-0 w-[calc(100%-1rem)] max-w-sm overflow-y-auto overscroll-contain rounded-[14px] border border-line-strong bg-surface p-1.5 text-ink shadow-xl"
        >
          <ul>
            {apps.map(app => (
              <li key={app.id}>
                <Link
                  href={app.href}
                  onClick={() => setOpen(false)}
                  aria-current={app.current ? 'page' : undefined}
                  className={cn(row, 'h-12 font-semibold', app.current ? 'bg-muted' : 'hover:bg-muted/70')}
                >
                  <AppIcon app={app.id} size={30} className="rounded-lg" />
                  <span className="min-w-0 flex-1 truncate">{app.name}</span>
                  {app.badge > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tabular-nums">
                      {badgeLabel(app.badge)}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mx-1 my-1.5 h-px bg-line" />
          <Link href="/settings" onClick={() => setOpen(false)} className={cn(row, 'h-11 font-medium hover:bg-muted')}>
            <span className="flex w-[30px] justify-center">
              <Settings size={18} aria-hidden="true" className="text-ink-muted" />
            </span>
            {tNav('settings')}
          </Link>
          {me.role === 'ADMIN' ? (
            <Link href="/admin" onClick={() => setOpen(false)} className={cn(row, 'h-11 font-medium hover:bg-muted')}>
              <span className="flex w-[30px] justify-center">
                <Shield size={18} aria-hidden="true" className="text-ink-muted" />
              </span>
              {tNav('admin')}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void signOutFully()}
            className={cn(row, 'h-11 font-medium text-danger hover:bg-danger-soft')}
          >
            <span className="flex w-[30px] justify-center">
              <LogOut size={18} aria-hidden="true" />
            </span>
            {tNav('signOut')}
          </button>
        </nav>
      ) : null}
    </div>
  );
}
