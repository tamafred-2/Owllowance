import type { ActivityItem } from './ledger';

// Text cells starting with these could run as spreadsheet formulas.
const formulaStart = /^[=+\-@\t\r]/;
function textCell(value: string | null): string {
  const text = value ?? '';
  const safe = formulaStart.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) || safe !== text ? `"${safe.replace(/"/g, '""')}"` : safe;
}
function amountCell(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}
const typeLabels = { expense: 'Expense', income: 'Income', opening: 'Opening balance', transfer: 'Transfer' } as const;

// One row per wallet movement; transfers produce one row per side.
export function transactionsCsv(items: ActivityItem[]): string {
  const header = 'Date,Type,Wallet,Other wallet,Category,Amount (PHP),Note';
  const rows = items.map(item => [
    item.localDate, typeLabels[item.type], textCell(item.walletName), textCell(item.counterpartyName),
    textCell(item.categoryName), amountCell(item.amountMinor), textCell(item.note),
  ].join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
