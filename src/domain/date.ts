import { ValidationError } from './money';

export type EventTime = {
  occurredAt: string;
  localDate: string;
  timeZone: string;
  offsetMinutes: number;
};

export function eventTime(now: Date = new Date()): EventTime {
  if (!Number.isFinite(now.getTime())) throw new ValidationError('Invalid transaction date.');
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    occurredAt: now.toISOString(),
    localDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    offsetMinutes: -now.getTimezoneOffset(),
  };
}

export function assertEventTime(value: EventTime): void {
  const date = new Date(`${value.localDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.localDate ||
      !Number.isFinite(Date.parse(value.occurredAt)) ||
      !Number.isInteger(value.offsetMinutes) || Math.abs(value.offsetMinutes) > 840) {
    throw new ValidationError('Invalid transaction date.');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }); }
  catch { throw new ValidationError('Invalid timezone.'); }
}

export function displayDate(localDate: string): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${localDate}T12:00:00Z`));
}
