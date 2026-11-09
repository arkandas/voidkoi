import { dayKey } from '@/lib/days';

/** A deadline is a day, stored as midnight UTC: shown as that day wherever you are. */
export function formatDeadline(deadline: string, locale?: string): string {
  return new Date(deadline).toLocaleDateString(locale, { timeZone: 'UTC' });
}

/** Overdue from the day after it is due, in local time. */
export function isOverdue(deadline: string, now = new Date()): boolean {
  return deadline.slice(0, 10) < dayKey(now);
}

/** The day a deadline falls on, "2026-10-27", for the date field. */
export function deadlineDay(deadline: string | null): string | null {
  return deadline ? deadline.slice(0, 10) : null;
}
