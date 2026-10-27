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

// Calendar arithmetic on YYYY-MM-DD strings, independent of the device timezone.
export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function assertLocalDate(localDate: string): void {
  const date = new Date(`${localDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
    throw new ValidationError('Choose a valid date.');
  }
}

// A chosen calendar day keeps the current time of day so same-day ordering stays natural.
export function eventTimeOn(localDate: string, now: Date = new Date()): EventTime {
  assertLocalDate(localDate);
  if (localDate > eventTime(now).localDate) throw new ValidationError('Choose today or an earlier date.');
  const [year, month, day] = localDate.split('-').map(Number);
  return eventTime(new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()));
}

export function monthStart(localDate: string): string { return `${localDate.slice(0, 7)}-01`; }
export function nextMonthStart(localDate: string): string {
  const [year, month] = localDate.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}
// Weeks start on Monday.
export function weekStart(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return addDays(localDate, -((weekday + 6) % 7));
}
