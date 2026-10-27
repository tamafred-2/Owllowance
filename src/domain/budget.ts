import type { BudgetPeriod } from './ledger';
import { addDays, monthStart, nextMonthStart, weekStart } from './date';

// Start-inclusive, end-exclusive window containing `today` (custom budgets use their own range).
export function budgetWindow(period: BudgetPeriod, startDate: string | null, endDate: string | null, today: string): { start: string; end: string } {
  if (period === 'custom') {
    if (!startDate || !endDate) throw new Error('Custom budget needs a range.');
    return { start: startDate, end: endDate };
  }
  if (period === 'weekly') { const start = weekStart(today); return { start, end: addDays(start, 7) }; }
  return { start: monthStart(today), end: nextMonthStart(today) };
}
