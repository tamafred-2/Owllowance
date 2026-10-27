import { addDays } from './date';
import type { Streak } from './ledger';

// Consecutive days with something recorded. Today still counts as "in progress": until the day ends,
// a streak that reached yesterday stays alive. `dates` are distinct local dates, newest first.
export function streakOf(dates: string[], today: string): Streak {
  const days = new Set(dates);
  const loggedToday = days.has(today);
  let current = 0;
  for (let day = loggedToday ? today : addDays(today, -1); days.has(day); day = addDays(day, -1)) current += 1;
  let best = 0, run = 0, previous: string | null = null;
  for (const day of [...days].filter(value => value <= today).sort()) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best: Math.max(best, current), loggedToday };
}
