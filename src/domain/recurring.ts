import { addDays, assertLocalDate } from './date';
import { ValidationError } from './money';

// monthly: `every` is the day of month (1-31, clamped to short months); weekly: weekday 1=Mon..7=Sun;
// days: repeat every `every` days from the start date.
export type Frequency = 'monthly' | 'weekly' | 'days';
export type Schedule = { frequency: Frequency; every: number; startDate: string };

export function assertSchedule(schedule: Schedule): void {
  assertLocalDate(schedule.startDate);
  const { frequency, every } = schedule;
  const max = frequency === 'monthly' ? 31 : frequency === 'weekly' ? 7 : 366;
  if (!['monthly', 'weekly', 'days'].includes(frequency) || !Number.isInteger(every) || every < 1 || every > max) {
    throw new ValidationError('Choose a valid repeat schedule.');
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Weekday of a YYYY-MM-DD date, 1 = Monday ... 7 = Sunday.
export function isoWeekday(localDate: string): number {
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// Due dates in [from, to] (inclusive, both YYYY-MM-DD), never before the start date.
export function dueDates(schedule: Schedule, from: string, to: string): string[] {
  assertSchedule(schedule);
  const start = from > schedule.startDate ? from : schedule.startDate;
  if (start > to) return [];
  const dates: string[] = [];
  if (schedule.frequency === 'monthly') {
    let [year, month] = start.split('-').map(Number);
    for (;;) {
      const day = Math.min(schedule.every, daysInMonth(year, month));
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (date > to) break;
      if (date >= start) dates.push(date);
      month += 1; if (month > 12) { month = 1; year += 1; }
    }
  } else if (schedule.frequency === 'weekly') {
    let date = addDays(start, (schedule.every - isoWeekday(start) + 7) % 7);
    for (; date <= to; date = addDays(date, 7)) dates.push(date);
  } else {
    const elapsed = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${schedule.startDate}T00:00:00Z`)) / 86_400_000);
    let date = addDays(schedule.startDate, Math.ceil(elapsed / schedule.every) * schedule.every);
    for (; date <= to; date = addDays(date, schedule.every)) dates.push(date);
  }
  return dates;
}

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function describeSchedule(schedule: Schedule): string {
  if (schedule.frequency === 'weekly') return `Every ${weekdayNames[schedule.every - 1]}`;
  if (schedule.frequency === 'days') return schedule.every === 1 ? 'Every day' : `Every ${schedule.every} days`;
  const suffix = schedule.every % 10 === 1 && schedule.every !== 11 ? 'st' : schedule.every % 10 === 2 && schedule.every !== 12 ? 'nd' : schedule.every % 10 === 3 && schedule.every !== 13 ? 'rd' : 'th';
  return `Monthly on the ${schedule.every}${suffix}`;
}
