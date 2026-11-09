import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/es';

export const CRON_FIELDS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const;

export type CronField = (typeof CRON_FIELDS)[number];

export type CronParts = Record<CronField, string>;

export const CRON_FIELD_RANGES: Record<CronField, string> = {
  minute: '0-59',
  hour: '0-23',
  dayOfMonth: '1-31',
  month: '1-12',
  dayOfWeek: '0-7',
};

export type CronValidation =
  | { valid: true }
  | { valid: false; error: 'empty' | 'fieldCount' | 'invalidExpression' }
  | { valid: false; error: 'invalidField'; field: CronField };

export const CRON_PRESETS = [
  { id: 'everyMinute', expression: '* * * * *' },
  { id: 'every5Minutes', expression: '*/5 * * * *' },
  { id: 'every15Minutes', expression: '*/15 * * * *' },
  { id: 'every30Minutes', expression: '*/30 * * * *' },
  { id: 'hourly', expression: '0 * * * *' },
  { id: 'dailyMidnight', expression: '0 0 * * *' },
  { id: 'dailyNoon', expression: '0 12 * * *' },
  { id: 'weeklySunday', expression: '0 0 * * 0' },
  { id: 'monthlyFirst', expression: '0 0 1 * *' },
  { id: 'weekdays9am', expression: '0 9 * * 1-5' },
] as const;

export type CronPresetId = (typeof CRON_PRESETS)[number]['id'];

function splitFields(expression: string): string[] {
  return expression.trim().split(/\s+/).filter(Boolean);
}

function isValidPattern(pattern: string): boolean {
  try {
    return new Cron(pattern, { paused: true }) instanceof Cron;
  } catch {
    return false;
  }
}

export function normalizeCronExpression(expression: string): string {
  return splitFields(expression).join(' ');
}

export function parseCronExpression(expression: string): CronParts {
  const separated = expression.split(' ');
  const fields = separated.length === CRON_FIELDS.length ? separated : splitFields(expression);
  const [minute = '', hour = '', dayOfMonth = '', month = '', dayOfWeek = ''] = fields;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function buildCronExpression(parts: CronParts): string {
  return CRON_FIELDS.map(field => parts[field]).join(' ');
}

export function validateCronExpression(expression: string): CronValidation {
  const fields = splitFields(expression);
  if (fields.length === 0) return { valid: false, error: 'empty' };
  if (fields.length !== CRON_FIELDS.length) return { valid: false, error: 'fieldCount' };

  const field = CRON_FIELDS.find(
    (_, index) => !isValidPattern(fields.map((value, other) => (other === index ? value : '*')).join(' '))
  );
  if (field) return { valid: false, error: 'invalidField', field };

  return isValidPattern(fields.join(' ')) ? { valid: true } : { valid: false, error: 'invalidExpression' };
}

export function getNextRuns(expression: string, count: number, from: Date, timezone?: string): Date[] {
  if (!validateCronExpression(expression).valid) return [];

  try {
    const job = new Cron(normalizeCronExpression(expression), { paused: true, ...(timezone ? { timezone } : {}) });
    return job.nextRuns(count, from);
  } catch {
    return [];
  }
}

export function describeCron(expression: string, locale: string): string | null {
  if (!validateCronExpression(expression).valid) return null;

  try {
    return cronstrue.toString(normalizeCronExpression(expression), {
      locale,
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch {
    return null;
  }
}
