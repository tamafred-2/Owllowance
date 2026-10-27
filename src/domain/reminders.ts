import type { DueItem } from './ledger';

export const REMINDER_HOUR = 9;
export type ReminderPlan = { localDate: string; title: string; body: string };

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

// One reminder per day that has payments due today or later; overdue items join today's reminder.
// Bodies name items only: no amounts on the lock screen.
export function reminderPlan(due: DueItem[], today: string): ReminderPlan[] {
  const byDate = new Map<string, string[]>();
  for (const item of due) {
    const date = item.dueDate < today ? today : item.dueDate;
    byDate.set(date, [...(byDate.get(date) ?? []), item.name]);
  }
  return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([localDate, names]) => {
    const unique = [...new Set(names)];
    return { localDate, title: 'Payments due', body: `${list(unique)} ${unique.length === 1 ? 'is' : 'are'} due${localDate === today ? ' today' : ''}.` };
  });
}
