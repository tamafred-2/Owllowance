import type { DebtDirection } from './ledger';

export const directionLabels: Record<DebtDirection, string> = { owe: 'I owe', owed: 'Owed to me' };

// What a debt entry means: positive adds to the debt, negative pays it down.
export function debtEntryLabel(direction: DebtDirection, amountMinor: number): string {
  if (direction === 'owe') return amountMinor > 0 ? 'Borrowed' : 'Paid back';
  return amountMinor > 0 ? 'Lent' : 'Got back';
}
