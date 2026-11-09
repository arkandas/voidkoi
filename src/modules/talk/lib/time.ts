/**
 * Date, time and duration formatting, in one place so the app reads alike.
 *
 * Everything that names a day or spells a duration speaks the reader's
 * language: components get a formatter for the active locale from
 * `useTimeFormat()`. The bare `format*` exports are the English ones, for code
 * that has no locale to hand.
 */
import { createTranslator, useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { Locale } from '@/i18n/config';
import englishTalk from '@/messages/en/talk.json';

const englishWords = englishTalk.time;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days between two instants, counting calendar days not 24h blocks. */
export function daysApart(a: Date, b: Date): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/** The `talk.time` catalog, as a plain function so this module works outside React. */
export type TimeWords = (
  key: keyof typeof englishWords,
  values?: Record<string, string | number>,
) => string;

export interface TimeFormat {
  /** 10:30, beside a message or a call. */
  time(iso: string): string;
  /** The centred pill above each day's messages. */
  dayLabel(iso: string, now?: Date): string;
  /** The timestamp beside a conversation in the list. */
  listTime(iso: string, now?: Date): string;
  /** The start time of a call in the history list. */
  callTime(iso: string, now?: Date): string;
  /** "2 min 5 sec" style, for the compact call rows in a conversation. */
  durationWords(totalSeconds: number): string;
}

/** Spanish weekdays are lower case; standing alone as a label they read better capitalised. */
function capitalise(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function createTimeFormat(locale: string, words: TimeWords): TimeFormat {
  const TIME = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const WEEKDAY = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const DAY = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
  const DAY_WITH_YEAR = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const DATE_TIME = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const weekday = (date: Date): string => capitalise(WEEKDAY.format(date), locale);
  const day = (date: Date, now: Date): string =>
    date.getFullYear() === now.getFullYear() ? DAY.format(date) : DAY_WITH_YEAR.format(date);

  return {
    time: (iso) => TIME.format(new Date(iso)),

    dayLabel(iso, now = new Date()) {
      const date = new Date(iso);
      const distance = daysApart(date, now);
      if (distance === 0) return words('today');
      if (distance === 1) return words('yesterday');
      if (distance < 7 && distance > 0) return weekday(date);
      return day(date, now);
    },

    listTime(iso, now = new Date()) {
      const date = new Date(iso);
      const distance = daysApart(date, now);
      if (distance === 0) return TIME.format(date);
      if (distance === 1) return words('yesterday');
      if (distance < 7 && distance > 0) return weekday(date);
      return day(date, now);
    },

    callTime(iso, now = new Date()) {
      const date = new Date(iso);
      const distance = daysApart(date, now);
      if (distance === 0) return words('todayAt', { time: TIME.format(date) });
      if (distance === 1) return words('yesterdayAt', { time: TIME.format(date) });
      return DATE_TIME.format(date);
    },

    durationWords(totalSeconds) {
      const seconds = Math.max(0, Math.floor(totalSeconds));
      if (seconds < 60) return words('seconds', { seconds });
      const minutes = Math.floor(seconds / 60);
      const rest = seconds % 60;
      return rest === 0
        ? words('minutes', { minutes })
        : words('minutesSeconds', { minutes, seconds: rest });
    },
  };
}

/** A formatter reading its words straight from a `time` catalog, outside React. */
export function timeFormatFrom(locale: Locale, catalog: typeof englishWords): TimeFormat {
  const t = createTranslator({ locale, messages: { time: catalog }, namespace: 'time' });
  return createTimeFormat(locale, (key, values) => t(key, values));
}

/** The formatter for the language the page is shown in. */
export function useTimeFormat(): TimeFormat {
  const locale = useLocale();
  const t = useTranslations('talk.time');
  return useMemo(() => createTimeFormat(locale, (key, values) => t(key, values)), [locale, t]);
}

const english = timeFormatFrom('en', englishWords);

export const formatDayLabel = english.dayLabel;
export const formatCallTime = english.callTime;
export const formatDurationWords = english.durationWords;

/** Group timeline items into day buckets, preserving order. */
export function groupByDay<T>(items: readonly T[], getDate: (item: T) => string): Array<{
  day: string;
  items: T[];
}> {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const item of items) {
    const iso = getDate(item);
    const day = new Date(iso).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
