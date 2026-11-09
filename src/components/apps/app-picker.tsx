'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppIcon } from '@/components/brand/mark';
import { cn } from '@/lib/cn';
import { APPS, offKey, uses, type AppInfo } from '@/modules/registry';

/** On: the app with every part of it. Off: none of it. */
function setApp(keys: string[], app: AppInfo, on: boolean): string[] {
  const own = new Set([app.id as string, ...app.subApps.map(sub => offKey(app.id, sub.id))]);
  const rest = keys.filter(key => !own.has(key));
  return on ? [...rest, app.id] : rest;
}

function setSubApp(keys: string[], app: AppInfo, sub: string, on: boolean): string[] {
  const key = offKey(app.id, sub);
  return on ? keys.filter(other => other !== key) : [...keys, key];
}

/**
 * Every app with a switch, and under an app that is on, its parts to keep or
 * leave out. Each row in the app's own colour. At least one part of an app
 * stays on while the app is.
 */
export function AppPicker({ value, onChange, disabled = false }: { value: string[]; onChange(keys: string[]): void; disabled?: boolean }) {
  const t = useTranslations();

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {APPS.map(app => {
        const on = value.includes(app.id);
        const subsOn = app.subApps.filter(sub => uses(value, app.id, sub.id));
        const switchId = `app-${app.id}`;
        return (
          <li key={app.id} data-app={app.id} className="flex gap-3.5 px-4 py-3.5">
            <AppIcon app={app.id} size={40} className="self-start rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="flex min-h-10 items-center justify-between gap-4">
                <label htmlFor={switchId} className={cn('min-w-0', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                  <span className="block text-[15px] font-semibold text-ink">{t(`${app.id}.app.name`)}</span>
                </label>
                <button
                  id={switchId}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onChange(setApp(value, app, !on))}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
                    'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60',
                    on ? 'border-accent bg-accent' : 'border-line-strong bg-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform duration-200',
                      on ? 'translate-x-[22px]' : 'translate-x-[2px]',
                    )}
                  />
                </button>
              </div>
              {on && app.subApps.length > 0 ? (
                <div role="group" aria-label={t(`${app.id}.app.name`)} className="mt-3 flex flex-wrap gap-2">
                  {app.subApps.map(sub => {
                    const subOn = subsOn.some(other => other.id === sub.id);
                    const last = subOn && subsOn.length === 1;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        aria-pressed={subOn}
                        disabled={disabled || last}
                        onClick={() => onChange(setSubApp(value, app, sub.id, !subOn))}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
                          'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 disabled:cursor-default',
                          subOn ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                        )}
                      >
                        {subOn ? <Check size={14} strokeWidth={2.5} aria-hidden="true" /> : null}
                        {t(`${app.id}.app.${sub.id}` as Parameters<typeof t>[0])}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
