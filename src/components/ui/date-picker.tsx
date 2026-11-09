'use client';

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import { addDays, addMonths, addMonthsTo, calendarDays, dayDate, dayKey, daysBetween, firstDayOfWeek, isDay, monthOf, type Month } from '@/lib/days';

import { IconButton } from './icon-button';

export interface DatePreset {
  label: string;
  /** The day it picks, "2026-10-27". */
  value: string;
}

export interface DatePickerProps {
  /** The chosen day, "2026-10-27". */
  value: string;
  onChange(value: string): void;
  /** Names the field for screen readers. */
  label: string;
  /** The first day that can be chosen. */
  min?: string;
  /** The last day that can be chosen. */
  max?: string;
  /** Days one click away, beside the calendar. */
  presets?: ReadonlyArray<DatePreset>;
}

/** The first letter up, as at the start of a line: "Martes, 27 de octubre". */
function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * A day, picked from a calendar that opens under the field. The app draws it
 * rather than the browser, so it looks the same in every browser and in the
 * Mac app.
 */
export function DatePicker({ value, onChange, label, min, max, presets }: DatePickerProps) {
  const locale = useLocale();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const today = dayKey(new Date());
  const day = isDay(value) ? value : (min ?? today);

  const text = useMemo(() => {
    const date = dayDate(day);
    const thisYear = date.getFullYear() === dayDate(today).getFullYear();
    const format = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(thisYear ? {} : { year: 'numeric' }) });
    return {
      day: capitalize(format.format(date), locale),
      relative: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(daysBetween(today, day), 'day'),
    };
  }, [day, locale, today]);

  useEffect(() => {
    if (!open) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    field.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [open]);

  const pick = (picked: string) => {
    onChange(picked);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    // Escape closes the calendar, not the dialog around it.
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div
      ref={field}
      onKeyDown={onKeyDown}
      className={cn(
        // The bottom margin keeps an opened calendar clear of the fade at a dialog's bottom edge.
        '@container scroll-mt-4 scroll-mb-12 overflow-hidden rounded-lg border bg-raised shadow-xs transition-[border-color,box-shadow]',
        open
          ? 'border-accent ring-4 ring-accent/15'
          : 'border-line-strong hover:border-ink-faint has-[>button:focus-visible]:border-accent has-[>button:focus-visible]:ring-4 has-[>button:focus-visible]:ring-accent/15',
      )}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(current => !current)}
        className="flex h-10 w-full items-center gap-2.5 px-3.5 text-left text-sm outline-hidden"
      >
        <CalendarDays size={17} aria-hidden="true" className="shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">
          <span className="sr-only">{label}: </span>
          {text.day}
        </span>
        <span className="hidden shrink-0 text-ink-muted @xs:inline">{text.relative}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn('shrink-0 text-ink-faint transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div id={panelId} className="border-t border-line">
          <Calendar value={day} min={min} max={max} today={today} presets={presets} onPick={pick} />
        </div>
      ) : null}
    </div>
  );
}

interface CalendarProps {
  value: string;
  min?: string;
  max?: string;
  today: string;
  presets?: ReadonlyArray<DatePreset>;
  onPick(day: string): void;
}

function Calendar({ value, min, max, today, presets, onPick }: CalendarProps) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const start = min && value < min ? min : max && value > max ? max : value;
  const [view, setView] = useState<Month>(() => monthOf(start));
  // The day the arrow keys move from: the one Tab stops on.
  const [active, setActive] = useState(start);
  const grid = useRef<HTMLTableElement>(null);
  const moved = useRef(false);

  // Where the week starts is the reader's custom, so it comes from the browser's region.
  const firstDay = useMemo(
    () => firstDayOfWeek(typeof navigator === 'undefined' ? locale : (navigator.languages?.[0] ?? navigator.language)),
    [locale],
  );

  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
      weekdayLong: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
      full: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    }),
    [locale],
  );

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${active}"]`)?.focus();
  }, [active, view]);

  const days = calendarDays(view, firstDay);
  const shown = (day: string) => {
    const month = monthOf(day);
    return month.year === view.year && month.month === view.month;
  };
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  const tabStop = shown(active)
    ? active
    : shown(value) && allowed(value)
      ? value
      : (days.find(day => shown(day) && allowed(day)) ?? days[0]);
  // The last day of the month before still counts, and the first of the month after.
  const canGoBack = !min || dayKey(new Date(view.year, view.month, 0)) >= min;
  const canGoForward = !max || dayKey(new Date(view.year, view.month + 1, 1)) <= max;
  const title = capitalize(formats.month.format(new Date(view.year, view.month, 1)), locale);

  const move = (day: string) => {
    const next = allowed(day) ? day : min && day < min ? min : max!;
    moved.current = true;
    setActive(next);
    setView(monthOf(next));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const column = (dayDate(day).getDay() - firstDay + 7) % 7;
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -column),
      End: () => addDays(day, 6 - column),
      PageUp: () => addMonths(day, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(day, event.shiftKey ? 12 : 1),
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    move(step());
  };

  return (
    <div className="flex flex-col gap-3 p-3 @lg:flex-row @lg:gap-4">
      {presets?.length ? (
        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-muted p-0.5 dark:bg-canvas @xs:grid-cols-4 @lg:w-36 @lg:shrink-0 @lg:grid-cols-1 @lg:self-start">
          {presets.map(preset => {
            const chosen = preset.value === value;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={chosen}
                disabled={!allowed(preset.value)}
                onClick={() => onPick(preset.value)}
                className={cn(
                  'h-9 truncate rounded-md px-1 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 sm:h-8 @lg:px-3 @lg:text-left',
                  chosen
                    ? 'bg-raised font-semibold text-ink shadow-sm ring-1 ring-line dark:bg-line-strong dark:ring-0'
                    : 'font-medium text-ink-muted hover:text-ink',
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-w-0 flex-1 @lg:border-l @lg:border-line @lg:pl-4">
        <div className="flex items-center justify-between gap-2">
          <IconButton
            size="sm"
            label={t('previous')}
            icon={<ChevronLeft size={18} />}
            onClick={() => setView(addMonthsTo(view, -1))}
            disabled={!canGoBack}
          />
          <p aria-live="polite" className="truncate text-sm font-semibold text-ink">
            {title}
          </p>
          <IconButton
            size="sm"
            label={t('next')}
            icon={<ChevronRight size={18} />}
            onClick={() => setView(addMonthsTo(view, 1))}
            disabled={!canGoForward}
          />
        </div>

        <table ref={grid} aria-label={title} className="mt-2 w-full table-fixed border-collapse">
          <thead>
            <tr>
              {days.slice(0, 7).map(day => {
                const date = dayDate(day);
                return (
                  <th
                    key={day}
                    scope="col"
                    abbr={formats.weekdayLong.format(date)}
                    className="pb-1.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase"
                  >
                    {formats.weekday.format(date).replace(/\.$/, '')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map(week => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map(day => {
                  const selected = day === value;
                  const isToday = day === today;
                  const enabled = allowed(day);
                  return (
                    <td key={day} className="p-0.5">
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === tabStop ? 0 : -1}
                        disabled={!enabled}
                        aria-pressed={selected}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={formats.full.format(dayDate(day))}
                        onClick={() => onPick(day)}
                        onKeyDown={event => onKeyDown(event, day)}
                        className={cn(
                          'relative mx-auto flex h-10 w-full max-w-11 items-center justify-center rounded-lg text-sm tabular-nums transition-colors sm:h-9',
                          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                          selected
                            ? 'bg-accent font-semibold text-accent-ink'
                            : !enabled
                              ? 'text-ink-faint/35'
                              : cn('hover:bg-muted', isToday ? 'font-semibold text-accent' : shown(day) ? 'text-ink' : 'text-ink-faint'),
                        )}
                      >
                        {dayDate(day).getDate()}
                        {isToday && !selected ? (
                          <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-accent" />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
