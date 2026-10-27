import { MAX_MINOR, ValidationError } from './money';

// Portable, unencrypted JSON backup. Rows mirror the storage columns of schema v4.
export const BACKUP_FORMAT = 'owllowance-backup';
export const BACKUP_SCHEMA_VERSION = 8;
// Older files still restore: version 4 has no recurring items, versions 4-5 have no goals,
// versions 4-6 have no goal descriptions, photos or wallet-backed goal money, versions 4-7 have no debts.
const MAX_RECORDS = 500_000;

type Row = Record<string, string | number | null>;
export type BackupRecords = {
  profiles: Row[]; accounts: Row[]; categories: Row[]; transactions: Row[]; entries: Row[]; budgets: Row[]; settings: Row[];
  recurring: Row[]; recurring_occurrences: Row[]; goals: Row[]; goal_contributions: Row[]; debts: Row[]; debt_entries: Row[];
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
  recurring: ['id', 'profile_id', 'name', 'type', 'amount_minor', 'account_id', 'category_id', 'frequency', 'every', 'start_date', 'paused'],
  recurring_occurrences: ['recurring_id', 'due_date', 'status', 'transaction_id'],
  goals: ['id', 'profile_id', 'name', 'target_minor', 'target_date', 'icon_key', 'color_token', 'archived_at', 'description', 'image_uri', 'completed_at'],
  goal_contributions: ['id', 'goal_id', 'amount_minor', 'local_date', 'note', 'transaction_id'],
  debts: ['id', 'profile_id', 'name', 'direction', 'due_date', 'note', 'archived_at'],
  debt_entries: ['id', 'debt_id', 'amount_minor', 'local_date', 'note', 'transaction_id'],
};
const integerColumns = new Set(['offset_minutes', 'revision', 'amount_minor', 'limit_minor', 'every', 'paused', 'target_minor']);
const nullableColumns = new Set(['archived_at', 'category_id', 'linked_id', 'start_date', 'end_date', 'transaction_id', 'target_date', 'image_uri', 'completed_at', 'due_date']);
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function fail(message: string): never { throw new ValidationError(`This backup can't be restored: ${message}`); }

// Rejects anything unexpected before live data is touched.
export function validateBackup(input: unknown): { envelope: BackupEnvelope; preview: BackupPreview } {
  if (!input || typeof input !== 'object') fail('the file is not an Owllowance backup.');
  const candidate = input as Partial<BackupEnvelope>;
  if (candidate.format !== BACKUP_FORMAT) fail('the file is not an Owllowance backup.');
  if (![4, 5, 6, 7, BACKUP_SCHEMA_VERSION].includes(Number(candidate.schemaVersion))) fail('it was made by an unsupported version of Owllowance.');
  if (candidate.currency !== 'PHP') fail('its currency is not supported.');
  if (typeof candidate.exportedAt !== 'string' || !Number.isFinite(Date.parse(candidate.exportedAt))) fail('its export date is invalid.');
  const records = candidate.records;
  if (!records || typeof records !== 'object') fail('records are missing.');
  let count = 0;
  for (const [table, columns] of Object.entries(backupColumns) as [keyof BackupRecords, string[]][]) {
    const addedLater = ((table === 'recurring' || table === 'recurring_occurrences') && candidate.schemaVersion === 4)
      || ((table === 'goals' || table === 'goal_contributions') && Number(candidate.schemaVersion) < 6)
      || ((table === 'debts' || table === 'debt_entries') && Number(candidate.schemaVersion) < 8);
    if (addedLater && records[table] === undefined) records[table] = [];
    const rows = records[table];
    if (!Array.isArray(rows)) fail(`${table} are missing.`);
    count += rows.length;
    if (count > MAX_RECORDS) fail('it is too large.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`a ${table} record is malformed.`);
      if (Number(candidate.schemaVersion) < 7 && table === 'goals') Object.assign(row, { description: '', image_uri: null }, row);
      if (Number(candidate.schemaVersion) < 8 && table === 'goals') Object.assign(row, { completed_at: null }, row);
      if (Number(candidate.schemaVersion) < 7 && table === 'goal_contributions') Object.assign(row, { transaction_id: null }, row);
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
  // Wallet-backed goal money: each linked contribution owns a one-sided transfer of the opposite amount.
  const goalMoves = new Map<string, number>();
  for (const contribution of records.goal_contributions) {
    if (contribution.transaction_id === null) continue;
    const transactionId = String(contribution.transaction_id);
    if (typeOf.get(transactionId) !== 'transfer' || goalMoves.has(transactionId)) fail('a goal contribution refers to a missing transaction.');
    goalMoves.set(transactionId, Number(contribution.amount_minor));
  }
  // Debts: borrowing/being repaid credits the wallet for money I owe, the reverse for money owed to me.
  const debtIds = ids(records.debts);
  if (debtIds.size !== records.debts.length) fail('it contains duplicate records.');
  const directionOf = new Map(records.debts.map(debt => [String(debt.id), String(debt.direction)]));
  for (const debt of records.debts) {
    if (!uuid.test(String(debt.id))) fail('it contains an invalid identifier.');
    if (debt.direction !== 'owe' && debt.direction !== 'owed') fail('a debt record is malformed.');
  }
  for (const entry of records.debt_entries) {
    if (!uuid.test(String(entry.id))) fail('it contains an invalid identifier.');
    if (!debtIds.has(String(entry.debt_id))) fail('a debt entry refers to a missing debt.');
    if (entry.transaction_id === null) continue;
    const transactionId = String(entry.transaction_id);
    if (typeOf.get(transactionId) !== 'transfer' || goalMoves.has(transactionId)) fail('a debt entry refers to a missing transaction.');
    goalMoves.set(transactionId, (directionOf.get(String(entry.debt_id)) === 'owe' ? -1 : 1) * Number(entry.amount_minor));
  }
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
    if (row.type === 'transfer' && goalMoves.has(String(row.id))) {
      if (own.length !== 1 || Number(own[0].amount_minor) !== -Number(goalMoves.get(String(row.id)))) fail('a goal movement is unbalanced.');
    } else if (row.type === 'transfer') {
      if (own.length !== 2 || Number(own[0].amount_minor) + Number(own[1].amount_minor) !== 0 || own[0].account_id === own[1].account_id) fail('a transfer is unbalanced.');
    } else if (own.length !== 1) fail('a transaction has the wrong number of entries.');
  }
  for (const budget of budgets) if (!categoryIds.has(String(budget.category_id))) fail('a budget refers to a missing category.');
  const ruleIds = ids(records.recurring);
  if (ruleIds.size !== records.recurring.length) fail('it contains duplicate records.');
  for (const rule of records.recurring) {
    if (!uuid.test(String(rule.id))) fail('it contains an invalid identifier.');
    if (!accountIds.has(String(rule.account_id)) || !categoryIds.has(String(rule.category_id))) fail('a recurring item refers to a missing record.');
  }
  const goalIds = ids(records.goals);
  if (goalIds.size !== records.goals.length) fail('it contains duplicate records.');
  for (const goal of records.goals) if (!uuid.test(String(goal.id))) fail('it contains an invalid identifier.');
  for (const contribution of records.goal_contributions) {
    if (!uuid.test(String(contribution.id))) fail('it contains an invalid identifier.');
    if (!goalIds.has(String(contribution.goal_id))) fail('a goal contribution refers to a missing goal.');
  }
  for (const occurrence of records.recurring_occurrences) {
    if (!ruleIds.has(String(occurrence.recurring_id))) fail('a recurring payment refers to a missing item.');
    if (occurrence.transaction_id !== null && !transactionIds.has(String(occurrence.transaction_id))) fail('a recurring payment refers to a missing transaction.');
  }
  const balances = new Map<string, number>();
  let total = 0;
  for (const entry of entries) {
    const next = (balances.get(String(entry.account_id)) ?? 0) + Number(entry.amount_minor);
    total += Number(entry.amount_minor);
    if (Math.abs(next) > MAX_MINOR || Math.abs(total) > MAX_MINOR) fail('a balance is outside the supported range.');
    balances.set(String(entry.account_id), next);
  }
  // Net worth counts money in goals as well as wallets.
  for (const contribution of records.goal_contributions) {
    total += Number(contribution.amount_minor);
    if (Math.abs(total) > MAX_MINOR) fail('a balance is outside the supported range.');
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
