import { MAX_MINOR, ValidationError } from './money';

// Portable, unencrypted JSON backup. Rows mirror the storage columns of schema v4.
export const BACKUP_FORMAT = 'owllowance-backup';
export const BACKUP_SCHEMA_VERSION = 4;
const MAX_RECORDS = 500_000;

type Row = Record<string, string | number | null>;
export type BackupRecords = {
  profiles: Row[]; accounts: Row[]; categories: Row[]; transactions: Row[]; entries: Row[]; budgets: Row[]; settings: Row[];
};
export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT; schemaVersion: number; exportedAt: string; appVersion: string; currency: 'PHP'; records: BackupRecords;
};
export type BackupPreview = {
  exportedAt: string; currency: string; wallets: number; transactions: number; categories: number; budgets: number; totalBalanceMinor: number;
};

// Column order is also the insert order used by restore.
export const backupColumns: Record<keyof BackupRecords, string[]> = {
  profiles: ['id', 'currency', 'time_zone'],
  accounts: ['id', 'profile_id', 'name', 'kind', 'archived_at', 'opening_name'],
  categories: ['id', 'profile_id', 'type', 'name', 'icon_key', 'color_token', 'archived_at'],
  transactions: ['id', 'profile_id', 'type', 'occurred_at', 'local_date', 'time_zone', 'offset_minutes', 'note', 'category_id', 'revision', 'linked_id'],
  entries: ['id', 'transaction_id', 'profile_id', 'account_id', 'amount_minor'],
  budgets: ['id', 'profile_id', 'category_id', 'period', 'start_date', 'end_date', 'limit_minor'],
  settings: ['key', 'value'],
};
const integerColumns = new Set(['offset_minutes', 'revision', 'amount_minor', 'limit_minor']);
const nullableColumns = new Set(['archived_at', 'category_id', 'linked_id', 'start_date', 'end_date']);
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function fail(message: string): never { throw new ValidationError(`This backup can't be restored: ${message}`); }

// Rejects anything unexpected before live data is touched.
export function validateBackup(input: unknown): { envelope: BackupEnvelope; preview: BackupPreview } {
  if (!input || typeof input !== 'object') fail('the file is not an Owllowance backup.');
  const candidate = input as Partial<BackupEnvelope>;
  if (candidate.format !== BACKUP_FORMAT) fail('the file is not an Owllowance backup.');
  if (candidate.schemaVersion !== BACKUP_SCHEMA_VERSION) fail('it was made by an unsupported version of Owllowance.');
  if (candidate.currency !== 'PHP') fail('its currency is not supported.');
  if (typeof candidate.exportedAt !== 'string' || !Number.isFinite(Date.parse(candidate.exportedAt))) fail('its export date is invalid.');
  const records = candidate.records;
  if (!records || typeof records !== 'object') fail('records are missing.');
  let count = 0;
  for (const [table, columns] of Object.entries(backupColumns) as [keyof BackupRecords, string[]][]) {
    const rows = records[table];
    if (!Array.isArray(rows)) fail(`${table} are missing.`);
    count += rows.length;
    if (count > MAX_RECORDS) fail('it is too large.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`a ${table} record is malformed.`);
      if (Object.keys(row).length !== columns.length) fail(`a ${table} record has unexpected fields.`);
      for (const column of columns) {
        const value = (row as Row)[column];
        if (value === null && nullableColumns.has(column)) continue;
        if (integerColumns.has(column) ? !Number.isSafeInteger(value) : typeof value !== 'string') fail(`a ${table} record has an invalid ${column}.`);
        if (typeof value === 'string' && value.length > 1000) fail(`a ${table} record is too long.`);
      }
    }
  }
  const ids = (rows: Row[]) => new Set(rows.map(row => String(row.id)));
  const { profiles, accounts, categories, transactions, entries, budgets } = records;
  if (profiles.length > 1) fail('it contains more than one profile.');
  if (profiles.length && profiles[0].currency !== 'PHP') fail('its currency is not supported.');
  for (const table of [accounts, categories, transactions, entries, budgets]) {
    if (ids(table).size !== table.length) fail('it contains duplicate records.');
    for (const row of table) if (!uuid.test(String(row.id))) fail('it contains an invalid identifier.');
  }
  const accountIds = ids(accounts), categoryIds = ids(categories), transactionIds = ids(transactions);
  const typeOf = new Map(transactions.map(row => [String(row.id), String(row.type)]));
  const byTransaction = new Map<string, Row[]>();
  for (const entry of entries) {
    if (!transactionIds.has(String(entry.transaction_id)) || !accountIds.has(String(entry.account_id))) fail('an entry refers to a missing record.');
    if (Math.abs(Number(entry.amount_minor)) > MAX_MINOR) fail('an amount is outside the supported range.');
    byTransaction.set(String(entry.transaction_id), [...(byTransaction.get(String(entry.transaction_id)) ?? []), entry]);
  }
  for (const row of transactions) {
    if (row.category_id !== null && !categoryIds.has(String(row.category_id))) fail('a transaction refers to a missing category.');
    if (row.linked_id !== null && typeOf.get(String(row.linked_id)) !== 'transfer') fail('a transfer fee refers to a missing transfer.');
    const own = byTransaction.get(String(row.id)) ?? [];
    if (row.type === 'transfer') {
      if (own.length !== 2 || Number(own[0].amount_minor) + Number(own[1].amount_minor) !== 0 || own[0].account_id === own[1].account_id) fail('a transfer is unbalanced.');
    } else if (own.length !== 1) fail('a transaction has the wrong number of entries.');
  }
  for (const budget of budgets) if (!categoryIds.has(String(budget.category_id))) fail('a budget refers to a missing category.');
  const balances = new Map<string, number>();
  let total = 0;
  for (const entry of entries) {
    const next = (balances.get(String(entry.account_id)) ?? 0) + Number(entry.amount_minor);
    total += Number(entry.amount_minor);
    if (Math.abs(next) > MAX_MINOR || Math.abs(total) > MAX_MINOR) fail('a balance is outside the supported range.');
    balances.set(String(entry.account_id), next);
  }
  return {
    envelope: candidate as BackupEnvelope,
    preview: {
      exportedAt: candidate.exportedAt, currency: candidate.currency, wallets: accounts.length,
      transactions: transactions.filter(row => row.type !== 'opening').length, categories: categories.length, budgets: budgets.length, totalBalanceMinor: total,
    },
  };
}

export function parseBackup(text: string): { envelope: BackupEnvelope; preview: BackupPreview } {
  if (text.length > 100_000_000) fail('it is too large.');
  let json: unknown;
  try { json = JSON.parse(text); } catch { fail('the file is damaged or not JSON.'); }
  return validateBackup(json);
}
