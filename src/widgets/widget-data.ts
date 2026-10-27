import type { Overview } from '../domain/ledger';
import { NET_WORTH } from '../domain/ledger';
import { addDays, eventTime } from '../domain/date';
import { formatMoney } from '../domain/money';
import type { DueRow } from './owllowance-widgets';

function when(dueDate: string, today: string): string {
  if (dueDate < today) return 'Overdue';
  if (dueDate === today) return 'Today';
  if (dueDate === addDays(today, 1)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dueDate}T12:00:00Z`));
}

// Rows that fit the widget's height (about 26 dp each below the title).
export function dueRows(overview: Overview, heightDp: number): { rows: DueRow[]; more: number } {
  const today = eventTime().localDate;
  const fit = Math.max(1, Math.floor((heightDp - 56) / 26));
  const all = overview.due.map(item => ({ name: item.name, when: when(item.dueDate, today), overdue: item.dueDate < today }));
  return { rows: all.slice(0, fit), more: Math.max(0, all.length - fit) };
}

export function balanceText(overview: Overview): string {
  return overview.settings.hiddenBalances.includes(NET_WORTH) ? '₱ ••••' : formatMoney(overview.totalBalanceMinor);
}
