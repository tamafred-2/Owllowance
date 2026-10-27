import { validateWalletName } from '../domain/wallet-name';
import type {
  ActivityItem, Budget, BudgetCommand, CategoryCommand, ContributionCommand, DueItem, Goal, GoalCommand, GoalContribution, EditEntryCommand, EditTransferCommand, EntryCommand, HistoryFilter, LedgerRepository,
  ManagedCategory, OpeningCommand, Overview, PayRecurringCommand, RecurringCommand, RecurringRule, Report, Settings, TransferCommand, Wallet,
} from '../domain/ledger';
import { defaultSettings, NET_WORTH } from '../domain/ledger';
import { addDays, assertEventTime, assertLocalDate, eventTime } from '../domain/date';
import { assertSchedule, dueDates } from '../domain/recurring';
import { addMinor, assertMinor, ValidationError } from '../domain/money';
import { budgetWindow } from '../domain/budget';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, backupColumns, validateBackup, type BackupEnvelope, type BackupRecords } from '../domain/backup';
import { categoryColorTokens, categoryIconKeys, validateCategoryName } from '../domain/category';
import { FEE_CATEGORY, migrate, seedFeeCategory, seedIncomeCategories } from './migrations';
import { Database, type SqlConnection, type SqlValue } from './sql';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const RESERVED_PREFIX = '00000000-0000-4000-8000-';
const categories = [
  ['Food & drink', 'food'], ['Transport', 'transport'], ['Shopping', 'shopping'],
  ['Bills', 'bills'], ['Health', 'health'], ['Other', 'other'],
];

type Existing = {
  type: string; account_id: string; category_id: string | null; amount_minor: number;
  note: string; occurred_at: string; local_date: string; time_zone: string; offset_minutes: number;
  wallet_name: string; wallet_kind: string;
};
type Stored = { id: string; type: string; revision: number; linked_id: string | null; category_id: string | null };
const activitySelect = `SELECT t.id, t.type, t.occurred_at AS occurredAt,
  t.local_date AS localDate, t.time_zone AS timeZone, t.offset_minutes AS offsetMinutes,
  t.note, t.revision, t.linked_id AS linkedId, e.amount_minor AS amountMinor, a.id AS walletId, a.name AS walletName,
  t.category_id AS categoryId, c.name AS categoryName, c.icon_key AS iconKey, c.color_token AS colorToken,
  CASE WHEN t.type = 'transfer' THEN COALESCE((SELECT a2.name FROM entries e2 JOIN accounts a2 ON a2.id = e2.account_id
    WHERE e2.transaction_id = t.id AND e2.id <> e.id), g.name) END AS counterpartyName, gc.goal_id AS goalId,
  CASE WHEN t.type = 'transfer' THEN (SELECT e5.account_id FROM entries e5 WHERE e5.transaction_id = t.id AND e5.id <> e.id) END AS counterpartyId,
  CASE WHEN t.type = 'transfer' THEN (SELECT -SUM(e4.amount_minor) FROM transactions t4 JOIN entries e4 ON e4.transaction_id = t4.id
    WHERE t4.linked_id = t.id AND e4.account_id = e.account_id) END AS feeMinor
  FROM transactions t JOIN entries e ON e.transaction_id = t.id
  JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN goal_contributions gc ON gc.transaction_id = t.id LEFT JOIN goals g ON g.id = gc.goal_id`;
// Without a wallet filter a transfer appears once, from its source side. Goal movements have one side only.
const singleTransferRow = "NOT (t.type = 'transfer' AND e.amount_minor > 0 AND EXISTS (SELECT 1 FROM entries e6 WHERE e6.transaction_id = t.id AND e6.id <> e.id))";
const activityOrder = ' ORDER BY t.local_date DESC, t.occurred_at DESC, t.id DESC LIMIT ? OFFSET ?';
// Fee expenses are shown inside their transfer row.
const foldedFees = 't.linked_id IS NULL';
const activityQuery = `${activitySelect} WHERE ${singleTransferRow} AND ${foldedFees}${activityOrder}`;

function assertId(id: string): void {
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) {
    throw new ValidationError('Invalid record identifier.');
  }
}

function assertNote(note: string): void {
  if (note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
}

async function alreadyPosted(sql: SqlConnection, command: EntryCommand | OpeningCommand, type: 'expense' | 'income' | 'opening'): Promise<boolean> {
  const existing = await sql.getFirstAsync<Existing>(`SELECT t.*, e.account_id, e.amount_minor, a.opening_name AS wallet_name, a.kind AS wallet_kind
    FROM transactions t JOIN entries e ON e.transaction_id = t.id
    JOIN accounts a ON a.id = e.account_id WHERE t.id = ?`, command.id);
  if (!existing) return false;
  const hasCategory = 'categoryId' in command;
  if (existing.type !== type || existing.account_id !== command.walletId ||
      existing.amount_minor !== (type === 'expense' ? -command.amountMinor : command.amountMinor) ||
      existing.category_id !== (hasCategory ? command.categoryId : null) ||
      existing.note !== (hasCategory ? command.note : '') ||
      (!hasCategory && (existing.wallet_name !== command.walletName.trim() || existing.wallet_kind !== (command.walletKind ?? 'cash'))) ||
      existing.occurred_at !== command.occurredAt || existing.local_date !== command.localDate ||
      existing.time_zone !== command.timeZone || existing.offset_minutes !== command.offsetMinutes) {
    throw new ValidationError('This request identifier was already used for a different transaction.');
  }
  return true;
}

async function insertTransaction(sql: SqlConnection, command: EntryCommand | OpeningCommand, type: 'expense' | 'income' | 'opening', linkedId: string | null = null): Promise<void> {
  const hasCategory = 'categoryId' in command;
  await sql.runAsync(`INSERT INTO transactions
    (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, linked_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, command.id, PROFILE, type,
  command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes,
  hasCategory ? command.note : '', hasCategory ? command.categoryId : null, linkedId);
  await sql.runAsync(`INSERT INTO entries (id, transaction_id, profile_id, account_id, amount_minor)
    VALUES (?, ?, ?, ?, ?)`, command.id, command.id, PROFILE, command.walletId,
  type === 'expense' ? -command.amountMinor : command.amountMinor);
}

async function activeBalance(sql: SqlConnection, walletId: string): Promise<number | null> {
  const account = await sql.getFirstAsync<{ balance: number }>(`
    SELECT COALESCE(SUM(e.amount_minor), 0) AS balance FROM accounts a
    LEFT JOIN entries e ON e.account_id = a.id WHERE a.id = ? AND a.profile_id = ? AND a.archived_at IS NULL GROUP BY a.id`,
  walletId, PROFILE);
  return account ? account.balance : null;
}

async function walletBalance(sql: SqlConnection, walletId: string): Promise<number> {
  return (await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM entries WHERE account_id = ?', walletId))?.amount ?? 0;
}

async function totalBalance(sql: SqlConnection): Promise<number> {
  return (await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM entries'))?.amount ?? 0;
}

async function goalsTotal(sql: SqlConnection): Promise<number> {
  return (await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM goal_contributions'))?.amount ?? 0;
}

// Goal movements are changed from their goal so the goal's saved total always matches its wallets.
async function assertNotGoalMove(sql: SqlConnection, transactionId: string): Promise<void> {
  if (await sql.getFirstAsync('SELECT id FROM goal_contributions WHERE transaction_id = ?', transactionId)) {
    throw new ValidationError('This moved money with a savings goal. Change it from the goal.');
  }
}

async function typeTotal(sql: SqlConnection, type: 'expense' | 'income'): Promise<number> {
  return (await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(SUM(abs(e.amount_minor)), 0) AS amount FROM entries e
    JOIN transactions t ON t.id = e.transaction_id WHERE t.type = ?`, type))?.amount ?? 0;
}

function historyWhere(filter: HistoryFilter): { clause: string; params: SqlValue[] } {
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filter.walletId) { assertId(filter.walletId); conditions.push('a.id = ?'); params.push(filter.walletId); }
  else conditions.push(singleTransferRow);
  // Expense/category filters and exports still list fees on their own.
  if (!filter.separateFees && !filter.linkedId && filter.type !== 'expense' && !filter.categoryId) conditions.push(foldedFees);
  if (filter.type) {
    if (!['expense', 'income', 'transfer'].includes(filter.type)) throw new ValidationError('Invalid history filter.');
    conditions.push('t.type = ?'); params.push(filter.type);
  }
  if (filter.linkedId) { assertId(filter.linkedId); conditions.push('t.linked_id = ?'); params.push(filter.linkedId); }
  if (filter.categoryId) { assertId(filter.categoryId); conditions.push('t.category_id = ?'); params.push(filter.categoryId); }
  if (filter.fromDate) { assertLocalDate(filter.fromDate); conditions.push('t.local_date >= ?'); params.push(filter.fromDate); }
  if (filter.toDateExclusive) { assertLocalDate(filter.toDateExclusive); conditions.push('t.local_date < ?'); params.push(filter.toDateExclusive); }
  const search = filter.search?.trim();
  if (search) {
    if (search.length > 100) throw new ValidationError('Keep searches within 100 characters.');
    const pattern = `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`;
    // Wallet names match either side of a transfer; goal names match goal movements.
    conditions.push(`(t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR g.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM entries e3
      JOIN accounts a3 ON a3.id = e3.account_id WHERE e3.transaction_id = t.id AND a3.name LIKE ? ESCAPE '\\'))`);
    params.push(pattern, pattern, pattern, pattern);
  }
  return { clause: ` WHERE ${conditions.join(' AND ')}`, params };
}

async function readSettings(sql: SqlConnection): Promise<Settings> {
  const rows = await sql.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    theme: values.theme === 'light' || values.theme === 'dark' ? values.theme : defaultSettings.theme,
    walletView: values.walletView === 'list' || values.walletView === 'cards' ? values.walletView : defaultSettings.walletView,
    deckWallet: values.deckWallet ?? null,
    reminders: values.reminders === '1',
    guideSeen: values.guideSeen === '1',
    hiddenBalances: rows.filter(row => row.key.startsWith('hide:') && row.value === '1').map(row => row.key.slice(5)),
    reduceMotion: values.reduceMotion === '1',
    lastBackupAt: values.lastBackupAt ?? null,
  };
}

async function readRecords(sql: SqlConnection): Promise<BackupRecords> {
  const records = {} as BackupRecords;
  for (const [table, columns] of Object.entries(backupColumns) as [keyof BackupRecords, string[]][]) {
    records[table] = await sql.getAllAsync(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY rowid`);
  }
  return records;
}

function envelopeOf(records: BackupRecords, appVersion: string): BackupEnvelope {
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), appVersion, currency: 'PHP', records };
}

// Replaces every ledger row inside the caller's transaction; constraints and triggers re-check the data.
async function replaceRecords(sql: SqlConnection, records: BackupRecords): Promise<void> {
  await sql.execAsync(`DELETE FROM goal_contributions; DELETE FROM goals; DELETE FROM recurring_occurrences; DELETE FROM recurring; DELETE FROM budgets; DELETE FROM entries; DELETE FROM transactions WHERE linked_id IS NOT NULL;
    DELETE FROM transactions; DELETE FROM categories; DELETE FROM accounts; DELETE FROM profiles; DELETE FROM settings;`);
  const insert = async (table: keyof BackupRecords, rows: BackupRecords[keyof BackupRecords]) => {
    const columns = backupColumns[table];
    for (const row of rows) {
      await sql.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map(column => row[column] ?? null));
    }
  };
  await insert('profiles', records.profiles);
  await insert('accounts', records.accounts);
  await insert('categories', records.categories);
  await insert('transactions', records.transactions.filter(row => row.linked_id === null));
  await insert('transactions', records.transactions.filter(row => row.linked_id !== null));
  await insert('entries', records.entries);
  await insert('budgets', records.budgets);
  await insert('recurring', records.recurring);
  await insert('recurring_occurrences', records.recurring_occurrences);
  await insert('goals', records.goals);
  await insert('goal_contributions', records.goal_contributions);
  await insert('settings', records.settings.filter(row => ['theme', 'walletView', 'deckWallet', 'reminders', 'guideSeen', 'reduceMotion', 'lastBackupAt'].includes(String(row.key)) || /^hide:[\w-]{1,40}$/.test(String(row.key))));
  if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new ValidationError("This backup can't be restored: its records don't match.");
}

function assertEntryCommand(command: EntryCommand): void {
  assertId(command.id); assertId(command.walletId); assertId(command.categoryId); assertEventTime(command); assertMinor(command.amountMinor);
  if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
  assertNote(command.note);
}

// Posts an income/expense inside the caller's transaction (shared by entries and recurring payments).
async function postEntry(sql: SqlConnection, command: EntryCommand, type: 'expense' | 'income'): Promise<void> {
  if (await alreadyPosted(sql, command, type)) return;
  const balance = await activeBalance(sql, command.walletId);
  if (balance === null) throw new ValidationError('Choose an available wallet.');
  if (!await sql.getFirstAsync("SELECT id FROM categories WHERE id = ? AND profile_id = ? AND type = ? AND archived_at IS NULL", command.categoryId, PROFILE, type)) {
    throw new ValidationError('Choose an available category.');
  }
  const signed = type === 'expense' ? -command.amountMinor : command.amountMinor;
  addMinor(balance, signed);
  addMinor(await totalBalance(sql), signed);
  addMinor(await typeTotal(sql, type), command.amountMinor);
  await insertTransaction(sql, command, type);
}

type RuleRow = Omit<RecurringRule, 'paused' | 'nextDue'> & { paused: number };
const ruleSelect = `SELECT r.id, r.name, r.type, r.amount_minor AS amountMinor, r.account_id AS walletId, a.name AS walletName,
  r.category_id AS categoryId, c.name AS categoryName, c.icon_key AS iconKey, c.color_token AS colorToken,
  r.frequency, r.every, r.start_date AS startDate, r.paused
  FROM recurring r JOIN accounts a ON a.id = r.account_id JOIN categories c ON c.id = r.category_id`;
const LOOKBACK_DAYS = 60;

// Unhandled occurrences from up to 60 days back through the next 7 days, oldest first.
async function dueItems(sql: SqlConnection, today: string): Promise<DueItem[]> {
  const rules = await sql.getAllAsync<RuleRow>(`${ruleSelect} WHERE r.paused = 0 ORDER BY r.rowid`);
  const handled = new Set((await sql.getAllAsync<{ recurring_id: string; due_date: string }>(
    'SELECT recurring_id, due_date FROM recurring_occurrences WHERE due_date >= ?', addDays(today, -LOOKBACK_DAYS))).map(row => `${row.recurring_id}|${row.due_date}`));
  const items: DueItem[] = [];
  for (const rule of rules) {
    for (const dueDate of dueDates(rule, addDays(today, -LOOKBACK_DAYS), addDays(today, 7))) {
      if (handled.has(`${rule.id}|${dueDate}`)) continue;
      const { id, paused: _paused, frequency: _frequency, every: _every, startDate: _startDate, ...rest } = rule;
      items.push({ ...rest, recurringId: id, dueDate, overdue: dueDate < today });
    }
  }
  return items.sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.name.localeCompare(right.name));
}

export class SqlLedgerRepository implements LedgerRepository {
  constructor(private readonly database: Database) {}

  initialize(): Promise<void> { return migrate(this.database); }

  overview(): Promise<Overview> {
    return this.database.transaction(async sql => {
      const allWallets = await sql.getAllAsync<Wallet>(`
        SELECT a.id, a.name, a.kind, a.archived_at AS archivedAt, COALESCE(SUM(e.amount_minor), 0) AS balanceMinor FROM accounts a
        LEFT JOIN entries e ON e.account_id = a.id GROUP BY a.id ORDER BY a.rowid`);
      for (const wallet of allWallets) assertMinor(wallet.balanceMinor);
      const wallets = allWallets.filter(wallet => !wallet.archivedAt);
      const archivedWallets = allWallets.filter(wallet => Boolean(wallet.archivedAt));
      const today = eventTime().localDate;
      const todaySpent = await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(-SUM(e.amount_minor), 0) AS amount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'expense' AND t.local_date = ?`, today);
      const todayIncome = await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(SUM(e.amount_minor), 0) AS amount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'income' AND t.local_date = ?`, today);
      const totals = await sql.getFirstAsync<{ spentMinor: number; expenseCount: number }>(`
        SELECT COALESCE(-SUM(e.amount_minor), 0) AS spentMinor, COUNT(*) AS expenseCount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'expense'`);
      const income = await sql.getFirstAsync<{ amount: number; count: number }>("SELECT COALESCE(SUM(e.amount_minor), 0) AS amount, COUNT(*) AS count FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'income'");
      const budgetRows = await sql.getAllAsync<Omit<Budget, 'windowStart' | 'windowEnd' | 'spentMinor'>>(`
        SELECT b.id, b.category_id AS categoryId, c.name AS categoryName, c.icon_key AS iconKey, c.color_token AS colorToken,
        b.period, b.start_date AS startDate, b.end_date AS endDate, b.limit_minor AS limitMinor
        FROM budgets b JOIN categories c ON c.id = b.category_id ORDER BY b.rowid`);
      const budgets: Budget[] = [];
      for (const row of budgetRows) {
        const window = budgetWindow(row.period, row.startDate, row.endDate, today);
        const spent = await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(-SUM(e.amount_minor), 0) AS amount
          FROM transactions t JOIN entries e ON e.transaction_id = t.id
          WHERE t.type = 'expense' AND t.category_id = ? AND t.local_date >= ? AND t.local_date < ?`, row.categoryId, window.start, window.end);
        budgets.push({ ...row, windowStart: window.start, windowEnd: window.end, spentMinor: assertMinor(spent?.amount ?? 0) });
      }
      return {
        todayIncomeMinor: assertMinor(todayIncome?.amount ?? 0),
        incomeMinor: assertMinor(income?.amount ?? 0), incomeCount: income?.count ?? 0,
        incomeCategories: await sql.getAllAsync("SELECT id, name, icon_key AS iconKey, color_token AS colorToken FROM categories WHERE type = 'income' AND archived_at IS NULL ORDER BY rowid"),
        wallet: wallets[0] ?? null, wallets, archivedWallets, totalBalanceMinor: assertMinor(addMinor(await totalBalance(sql), await goalsTotal(sql))), todaySpentMinor: assertMinor(todaySpent?.amount ?? 0), spentMinor: assertMinor(totals?.spentMinor ?? 0), expenseCount: totals?.expenseCount ?? 0,
        categories: await sql.getAllAsync("SELECT id, name, icon_key AS iconKey, color_token AS colorToken FROM categories WHERE type = 'expense' AND archived_at IS NULL ORDER BY rowid"),
        recent: await sql.getAllAsync<ActivityItem>(activityQuery, 5, 0),
        budgets, due: await dueItems(sql, today), settings: await readSettings(sql),
        goals: (await sql.getAllAsync<Omit<Goal, 'hasWalletMoves'> & { hasWalletMoves: number }>(`SELECT g.id, g.name, g.description, g.image_uri AS imageUri,
          g.target_minor AS targetMinor, g.target_date AS targetDate, g.icon_key AS iconKey, g.color_token AS colorToken, g.archived_at AS archivedAt,
          COALESCE(SUM(c.amount_minor), 0) AS savedMinor, COUNT(c.transaction_id) > 0 AS hasWalletMoves
          FROM goals g LEFT JOIN goal_contributions c ON c.goal_id = g.id GROUP BY g.id ORDER BY g.archived_at IS NOT NULL, g.rowid`))
          .map(goal => ({ ...goal, hasWalletMoves: Boolean(goal.hasWalletMoves) })),
        restoreSnapshotAt: (await sql.getFirstAsync<{ created_at: string }>('SELECT created_at FROM restore_snapshots WHERE id = 1'))?.created_at ?? null,
      };
    });
  }

  history(offset: number, limit: number, filter: string | HistoryFilter = {}): Promise<ActivityItem[]> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return Promise.reject(new ValidationError('Invalid history page.'));
    }
    const { clause, params } = historyWhere(typeof filter === 'string' ? { walletId: filter } : filter);
    return this.database.exclusive(sql => sql.getAllAsync(activitySelect + clause + activityOrder, ...params, limit, offset));
  }

  transaction(id: string): Promise<ActivityItem | null> {
    assertId(id);
    return this.database.exclusive(sql => sql.getFirstAsync<ActivityItem>(`${activitySelect} WHERE t.id = ? AND ${singleTransferRow}`, id));
  }

  createWallet(command: OpeningCommand): Promise<void> {
    assertId(command.id); assertId(command.walletId); assertEventTime(command); assertMinor(command.amountMinor);
    if (command.amountMinor < 0) throw new ValidationError('Opening balance cannot be negative in this version.');
    const kind = command.walletKind ?? 'cash';
    if (!['cash', 'bank', 'ewallet'].includes(kind)) throw new ValidationError('Choose a valid wallet type.');
    const name = command.walletName.trim();
    if (!name || name.length > 60) throw new ValidationError('Use a wallet name between 1 and 60 characters.');
    return this.database.transaction(async sql => {
      if (await alreadyPosted(sql, command, 'opening')) return;
      validateWalletName(name, await sql.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM accounts WHERE profile_id = ?', PROFILE));
      addMinor(await totalBalance(sql), command.amountMinor);
      const profile = await sql.getFirstAsync('SELECT id FROM profiles WHERE id = ?', PROFILE);
      if (!profile) {
        await sql.runAsync('INSERT INTO profiles VALUES (?, ?, ?)', PROFILE, 'PHP', command.timeZone);
        for (const [index, [categoryName, icon]] of categories.entries()) {
          const id = `${RESERVED_PREFIX}${String(index + 100).padStart(12, '0')}`;
          await sql.runAsync("INSERT INTO categories (id, profile_id, type, name, icon_key, color_token) VALUES (?, ?, 'expense', ?, ?, 'accent')",
            id, PROFILE, categoryName, icon);
        }
      }
      await seedFeeCategory(sql);
      await seedIncomeCategories(sql);
      await sql.runAsync('INSERT INTO accounts (id, profile_id, name, kind, opening_name) VALUES (?, ?, ?, ?, ?)', command.walletId, PROFILE, name, kind, name);
      await insertTransaction(sql, command, 'opening');
    });
  }

  renameWallet(walletId: string, input: string): Promise<void> {
    assertId(walletId);
    const name = input.trim();
    if (!name || name.length > 60) throw new ValidationError('Use a wallet name between 1 and 60 characters.');
    return this.database.transaction(async sql => {
      validateWalletName(name, await sql.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM accounts WHERE profile_id = ?', PROFILE), walletId);
      const result = await sql.runAsync('UPDATE accounts SET name = ? WHERE id = ? AND profile_id = ?', name, walletId, PROFILE);
      if (!result.changes) throw new ValidationError('Wallet not found.');
    });
  }

  setWalletArchived(walletId: string, archived: boolean): Promise<void> {
    assertId(walletId);
    return this.database.transaction(async sql => {
      const result = await sql.runAsync('UPDATE accounts SET archived_at = ? WHERE id = ? AND profile_id = ?', archived ? new Date().toISOString() : null, walletId, PROFILE);
      if (!result.changes) throw new ValidationError('Wallet not found.');
    });
  }

  addExpense(command: EntryCommand): Promise<void> { return this.addEntry(command, 'expense'); }
  addIncome(command: EntryCommand): Promise<void> { return this.addEntry(command, 'income'); }

  private addEntry(command: EntryCommand, type: 'expense' | 'income'): Promise<void> {
    assertEntryCommand(command);
    return this.database.transaction(sql => postEntry(sql, command, type));
  }

  // Rewrites both sides of a transfer and its linked fee in one database transaction, revision-checked.
  updateTransfer(command: EditTransferCommand): Promise<void> {
    for (const id of [command.id, command.feeId, command.fromWalletId, command.toWalletId]) assertId(id);
    assertEventTime(command); assertMinor(command.amountMinor); assertMinor(command.feeMinor); assertNote(command.note);
    if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
    if (command.feeMinor < 0) throw new ValidationError('Fee cannot be negative.');
    if (command.feeMinor > command.amountMinor) throw new ValidationError("The fee can't be more than the amount you send.");
    if (command.fromWalletId === command.toWalletId) throw new ValidationError('Choose two different wallets.');
    return this.database.transaction(async sql => {
      const stored = await sql.getFirstAsync<Stored>('SELECT id, type, revision, linked_id, category_id FROM transactions WHERE id = ? AND profile_id = ?', command.id, PROFILE);
      if (!stored) throw new ValidationError('This transfer no longer exists.');
      if (stored.type !== 'transfer') throw new ValidationError('Only transfers can be edited here.');
      await assertNotGoalMove(sql, command.id);
      if (stored.revision !== command.revision) throw new ValidationError('This transfer changed. Reopen it and try again.');
      const entries = await sql.getAllAsync<{ id: string; account_id: string; amount_minor: number }>('SELECT id, account_id, amount_minor FROM entries WHERE transaction_id = ?', command.id);
      const source = entries.find(entry => entry.amount_minor < 0), destination = entries.find(entry => entry.amount_minor > 0);
      if (!source || !destination) throw new ValidationError('This transfer is damaged and cannot be edited.');
      const fee = await sql.getFirstAsync<{ id: string; account_id: string; amount_minor: number }>(`SELECT t.id, e.account_id, e.amount_minor FROM transactions t
        JOIN entries e ON e.transaction_id = t.id WHERE t.linked_id = ?`, command.id);
      // New wallets must be active; the ones it already uses may stay even if archived.
      for (const walletId of [command.fromWalletId, command.toWalletId]) {
        if (walletId !== source.account_id && walletId !== destination.account_id && await activeBalance(sql, walletId) === null) throw new ValidationError('Choose available wallets.');
      }
      // Bounds: each affected wallet's balance after removing the old movement and applying the new one.
      const delta = new Map<string, number>();
      const add = (walletId: string, amount: number) => delta.set(walletId, (delta.get(walletId) ?? 0) + amount);
      add(source.account_id, -source.amount_minor); add(destination.account_id, -destination.amount_minor);
      if (fee) add(fee.account_id, -fee.amount_minor);
      add(command.fromWalletId, -command.amountMinor - command.feeMinor); add(command.toWalletId, command.amountMinor);
      for (const [walletId, change] of delta) addMinor(await walletBalance(sql, walletId), change);
      addMinor(addMinor(await totalBalance(sql), fee ? -fee.amount_minor : 0), -command.feeMinor);
      await sql.runAsync(`UPDATE transactions SET occurred_at = ?, local_date = ?, time_zone = ?, offset_minutes = ?, note = ?, revision = revision + 1
        WHERE id = ? AND revision = ?`, command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes, command.note, command.id, command.revision);
      await sql.runAsync('UPDATE entries SET account_id = ?, amount_minor = ? WHERE id = ?', command.fromWalletId, -command.amountMinor, source.id);
      await sql.runAsync('UPDATE entries SET account_id = ?, amount_minor = ? WHERE id = ?', command.toWalletId, command.amountMinor, destination.id);
      if (fee && !command.feeMinor) {
        await sql.runAsync('DELETE FROM entries WHERE transaction_id = ?', fee.id);
        await sql.runAsync('DELETE FROM transactions WHERE id = ?', fee.id);
      } else if (fee) {
        await sql.runAsync(`UPDATE transactions SET occurred_at = ?, local_date = ?, time_zone = ?, offset_minutes = ?, revision = revision + 1 WHERE id = ?`,
          command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes, fee.id);
        await sql.runAsync('UPDATE entries SET account_id = ?, amount_minor = ? WHERE transaction_id = ?', command.fromWalletId, -command.feeMinor, fee.id);
      } else if (command.feeMinor) {
        if (await sql.getFirstAsync('SELECT id FROM transactions WHERE id = ?', command.feeId)) throw new ValidationError('Invalid record identifier.');
        await insertTransaction(sql, { ...command, id: command.feeId, walletId: command.fromWalletId, categoryId: FEE_CATEGORY, amountMinor: command.feeMinor, note: 'Transfer fee' }, 'expense', command.id);
      }
    });
  }

  addTransfer(command: TransferCommand): Promise<void> {
    for (const id of [command.id, command.toEntryId, command.feeId, command.fromWalletId, command.toWalletId]) assertId(id);
    assertEventTime(command); assertMinor(command.amountMinor); assertMinor(command.feeMinor); assertNote(command.note);
    if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
    if (command.feeMinor < 0) throw new ValidationError('Fee cannot be negative.');
    if (command.feeMinor > command.amountMinor) throw new ValidationError("The fee can't be more than the amount you send.");
    if (command.fromWalletId === command.toWalletId) throw new ValidationError('Choose two different wallets.');
    if (new Set([command.id, command.toEntryId, command.feeId]).size !== 3) throw new ValidationError('Invalid record identifier.');
    return this.database.transaction(async sql => {
      const existing = await sql.getFirstAsync<{ type: string; note: string; occurred_at: string; local_date: string; time_zone: string; offset_minutes: number }>(
        'SELECT type, note, occurred_at, local_date, time_zone, offset_minutes FROM transactions WHERE id = ?', command.id);
      if (existing) {
        const entries = await sql.getAllAsync<{ id: string; account_id: string; amount_minor: number }>('SELECT id, account_id, amount_minor FROM entries WHERE transaction_id = ? ORDER BY amount_minor', command.id);
        const fee = await sql.getFirstAsync<{ id: string; amount_minor: number; account_id: string }>(`SELECT t.id, e.amount_minor, e.account_id FROM transactions t
          JOIN entries e ON e.transaction_id = t.id WHERE t.linked_id = ?`, command.id);
        const same = existing.type === 'transfer' && existing.note === command.note && existing.occurred_at === command.occurredAt &&
          existing.local_date === command.localDate && existing.time_zone === command.timeZone && existing.offset_minutes === command.offsetMinutes &&
          entries.length === 2 && entries[0].id === command.id && entries[0].account_id === command.fromWalletId && entries[0].amount_minor === -command.amountMinor &&
          entries[1].id === command.toEntryId && entries[1].account_id === command.toWalletId && entries[1].amount_minor === command.amountMinor &&
          (command.feeMinor === 0 ? !fee : fee?.id === command.feeId && fee.amount_minor === -command.feeMinor && fee.account_id === command.fromWalletId);
        if (!same) throw new ValidationError('This request identifier was already used for a different transaction.');
        return;
      }
      const fromBalance = await activeBalance(sql, command.fromWalletId);
      const toBalance = await activeBalance(sql, command.toWalletId);
      if (fromBalance === null || toBalance === null) throw new ValidationError('Choose available wallets.');
      addMinor(fromBalance, -addMinor(command.amountMinor, command.feeMinor));
      addMinor(toBalance, command.amountMinor);
      addMinor(await totalBalance(sql), -command.feeMinor);
      if (command.feeMinor) addMinor(await typeTotal(sql, 'expense'), command.feeMinor);
      await sql.runAsync(`INSERT INTO transactions (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id)
        VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, NULL)`, command.id, PROFILE, command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes, command.note);
      await sql.runAsync('INSERT INTO entries (id, transaction_id, profile_id, account_id, amount_minor) VALUES (?, ?, ?, ?, ?)', command.id, command.id, PROFILE, command.fromWalletId, -command.amountMinor);
      await sql.runAsync('INSERT INTO entries (id, transaction_id, profile_id, account_id, amount_minor) VALUES (?, ?, ?, ?, ?)', command.toEntryId, command.id, PROFILE, command.toWalletId, command.amountMinor);
      if (command.feeMinor) {
        await insertTransaction(sql, { ...command, id: command.feeId, walletId: command.fromWalletId, categoryId: FEE_CATEGORY, amountMinor: command.feeMinor, note: 'Transfer fee' }, 'expense', command.id);
      }
    });
  }

  updateEntry(command: EditEntryCommand): Promise<void> {
    assertId(command.id); assertId(command.walletId); assertId(command.categoryId); assertEventTime(command); assertMinor(command.amountMinor);
    if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
    assertNote(command.note);
    return this.database.transaction(async sql => {
      const stored = await sql.getFirstAsync<Stored & { account_id: string; amount_minor: number }>(`SELECT t.id, t.type, t.revision, t.linked_id, t.category_id, e.account_id, e.amount_minor
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.id = ? AND t.profile_id = ?`, command.id, PROFILE);
      if (!stored) throw new ValidationError('This transaction no longer exists.');
      if (stored.type !== 'expense' && stored.type !== 'income') throw new ValidationError('Only income and expenses can be edited.');
      if (stored.linked_id) throw new ValidationError('Transfer fees change with their transfer.');
      if (stored.revision !== command.revision) throw new ValidationError('This transaction changed. Reopen it and try again.');
      const type = stored.type;
      if (command.walletId !== stored.account_id && await activeBalance(sql, command.walletId) === null) throw new ValidationError('Choose an available wallet.');
      const categoryOk = await sql.getFirstAsync('SELECT id FROM categories WHERE id = ? AND profile_id = ? AND type = ? AND (archived_at IS NULL OR id = ?)',
        command.categoryId, PROFILE, type, stored.category_id);
      if (!categoryOk) throw new ValidationError('Choose an available category.');
      const signed = type === 'expense' ? -command.amountMinor : command.amountMinor;
      const targetBefore = await walletBalance(sql, command.walletId);
      addMinor(command.walletId === stored.account_id ? addMinor(targetBefore, -stored.amount_minor) : targetBefore, signed);
      addMinor(addMinor(await totalBalance(sql), -stored.amount_minor), signed);
      addMinor(addMinor(await typeTotal(sql, type), -Math.abs(stored.amount_minor)), command.amountMinor);
      await sql.runAsync(`UPDATE transactions SET occurred_at = ?, local_date = ?, time_zone = ?, offset_minutes = ?, note = ?, category_id = ?, revision = revision + 1
        WHERE id = ? AND revision = ?`, command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes, command.note, command.categoryId, command.id, command.revision);
      await sql.runAsync('UPDATE entries SET account_id = ?, amount_minor = ? WHERE transaction_id = ?', command.walletId, signed, command.id);
    });
  }

  deleteTransaction(id: string, revision: number): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      const stored = await sql.getFirstAsync<Stored>('SELECT id, type, revision, linked_id, category_id FROM transactions WHERE id = ? AND profile_id = ?', id, PROFILE);
      if (!stored) return; // Already deleted: a repeated request is harmless.
      if (stored.type === 'opening') throw new ValidationError('Opening balances cannot be deleted.');
      if (stored.linked_id) throw new ValidationError('Delete the transfer to remove its fee.');
      if (stored.revision !== revision) throw new ValidationError('This transaction changed. Reopen it and try again.');
      await assertNotGoalMove(sql, id);
      const linked = await sql.getAllAsync<{ id: string }>('SELECT id FROM transactions WHERE linked_id = ?', id);
      const ids = [id, ...linked.map(row => row.id)];
      const removed = await sql.getAllAsync<{ account_id: string; amount_minor: number }>(
        `SELECT account_id, amount_minor FROM entries WHERE transaction_id IN (${ids.map(() => '?').join(',')})`, ...ids);
      let total = await totalBalance(sql);
      for (const entry of removed) {
        addMinor(await walletBalance(sql, entry.account_id), -entry.amount_minor);
        total = addMinor(total, -entry.amount_minor);
      }
      for (const transactionId of ids.slice(1).concat(id)) {
        await sql.runAsync('DELETE FROM entries WHERE transaction_id = ?', transactionId);
        await sql.runAsync('DELETE FROM transactions WHERE id = ?', transactionId);
      }
    });
  }

  categories(): Promise<ManagedCategory[]> {
    return this.database.exclusive(async sql => (await sql.getAllAsync<Omit<ManagedCategory, 'custom'>>(`SELECT id, type, name, icon_key AS iconKey,
      color_token AS colorToken, archived_at AS archivedAt FROM categories ORDER BY type, rowid`)).map(row => ({ ...row, custom: !row.id.startsWith(RESERVED_PREFIX) })));
  }

  saveCategory(command: CategoryCommand): Promise<void> {
    assertId(command.id);
    if (command.type !== 'expense' && command.type !== 'income') throw new ValidationError('Choose a category type.');
    if (!(categoryIconKeys as readonly string[]).includes(command.iconKey)) throw new ValidationError('Choose an icon.');
    if (!(categoryColorTokens as readonly string[]).includes(command.colorToken)) throw new ValidationError('Choose a color.');
    return this.database.transaction(async sql => {
      if (!await sql.getFirstAsync('SELECT id FROM profiles WHERE id = ?', PROFILE)) throw new ValidationError('Create a wallet first.');
      const existing = await sql.getAllAsync<{ id: string; name: string; type: string }>('SELECT id, name, type FROM categories WHERE profile_id = ?', PROFILE);
      const name = validateCategoryName(command.name, existing, command.type, command.id);
      const current = existing.find(item => item.id === command.id);
      if (current) {
        if (current.type !== command.type) throw new ValidationError('A category keeps its type.');
        await sql.runAsync('UPDATE categories SET name = ?, icon_key = ?, color_token = ? WHERE id = ?', name, command.iconKey, command.colorToken, command.id);
      } else {
        await sql.runAsync('INSERT INTO categories (id, profile_id, type, name, icon_key, color_token) VALUES (?, ?, ?, ?, ?, ?)',
          command.id, PROFILE, command.type, name, command.iconKey, command.colorToken);
      }
    });
  }

  setCategoryArchived(id: string, archived: boolean): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      const category = await sql.getFirstAsync<{ type: string }>('SELECT type FROM categories WHERE id = ? AND profile_id = ?', id, PROFILE);
      if (!category) throw new ValidationError('Category not found.');
      if (archived) {
        const active = await sql.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM categories WHERE type = ? AND archived_at IS NULL AND id <> ?', category.type, id);
        if (!active?.count) throw new ValidationError('Keep at least one active category of this type.');
      }
      await sql.runAsync('UPDATE categories SET archived_at = ? WHERE id = ?', archived ? new Date().toISOString() : null, id);
    });
  }

  saveBudget(command: BudgetCommand): Promise<void> {
    assertId(command.id); assertId(command.categoryId); assertMinor(command.limitMinor);
    if (command.limitMinor <= 0) throw new ValidationError('Budget limit must be greater than zero.');
    if (!['monthly', 'weekly', 'custom'].includes(command.period)) throw new ValidationError('Choose a budget period.');
    const custom = command.period === 'custom';
    if (custom) {
      if (!command.startDate || !command.endDate) throw new ValidationError('Choose start and end dates.');
      assertLocalDate(command.startDate); assertLocalDate(command.endDate);
      if (command.endDate <= command.startDate) throw new ValidationError('End date must be after the start date.');
    }
    return this.database.transaction(async sql => {
      if (!await sql.getFirstAsync("SELECT id FROM categories WHERE id = ? AND profile_id = ? AND type = 'expense'", command.categoryId, PROFILE)) {
        throw new ValidationError('Choose an expense category.');
      }
      const clash = await sql.getFirstAsync('SELECT id FROM budgets WHERE category_id = ? AND id <> ?', command.categoryId, command.id);
      if (clash) throw new ValidationError('This category already has a budget.');
      await sql.runAsync(`INSERT INTO budgets (id, profile_id, category_id, period, start_date, end_date, limit_minor) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, period = excluded.period, start_date = excluded.start_date,
        end_date = excluded.end_date, limit_minor = excluded.limit_minor`, command.id, PROFILE, command.categoryId, command.period,
      custom ? command.startDate : null, custom ? command.endDate : null, command.limitMinor);
    });
  }

  deleteBudget(id: string): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => { await sql.runAsync('DELETE FROM budgets WHERE id = ?', id); });
  }

  report(fromDate: string, toDateExclusive: string): Promise<Report> {
    assertLocalDate(fromDate); assertLocalDate(toDateExclusive);
    if (toDateExclusive <= fromDate) return Promise.reject(new ValidationError('Choose a valid date range.'));
    return this.database.transaction(async sql => {
      const sums = await sql.getFirstAsync<{ income: number; expense: number }>(`SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN e.amount_minor END), 0) AS income,
        COALESCE(-SUM(CASE WHEN t.type = 'expense' THEN e.amount_minor END), 0) AS expense
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.local_date >= ? AND t.local_date < ?`, fromDate, toDateExclusive);
      const byCategory = await sql.getAllAsync<Report['byCategory'][number]>(`SELECT c.id AS categoryId, c.name, c.icon_key AS iconKey, c.color_token AS colorToken,
        -SUM(e.amount_minor) AS amountMinor, COUNT(*) AS count FROM transactions t JOIN entries e ON e.transaction_id = t.id JOIN categories c ON c.id = t.category_id
        WHERE t.type = 'expense' AND t.local_date >= ? AND t.local_date < ? GROUP BY c.id ORDER BY amountMinor DESC, c.name`, fromDate, toDateExclusive);
      return { incomeMinor: assertMinor(sums?.income ?? 0), expenseMinor: assertMinor(sums?.expense ?? 0), byCategory };
    });
  }

  // One row per masked balance keeps each value short.
  setBalanceHidden(target: string, hidden: boolean): Promise<void> {
    if (target !== NET_WORTH) assertId(target);
    return this.database.transaction(async sql => {
      if (hidden) await sql.runAsync("INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", `hide:${target}`);
      else await sql.runAsync('DELETE FROM settings WHERE key = ?', `hide:${target}`);
    });
  }

  saveSettings(settings: Partial<Omit<Settings, 'hiddenBalances'>>): Promise<void> {
    const rows: [string, string][] = [];
    if (settings.theme !== undefined) {
      if (!['system', 'light', 'dark'].includes(settings.theme)) throw new ValidationError('Choose a theme.');
      rows.push(['theme', settings.theme]);
    }
    if (settings.walletView !== undefined) {
      if (!['grid', 'list', 'cards'].includes(settings.walletView)) throw new ValidationError('Choose a wallet view.');
      rows.push(['walletView', settings.walletView]);
    }
    if (settings.deckWallet !== undefined && settings.deckWallet !== null) { assertId(settings.deckWallet); rows.push(['deckWallet', settings.deckWallet]); }
    if (settings.reminders !== undefined) rows.push(['reminders', settings.reminders ? '1' : '0']);
    if (settings.guideSeen !== undefined) rows.push(['guideSeen', settings.guideSeen ? '1' : '0']);
    if (settings.reduceMotion !== undefined) rows.push(['reduceMotion', settings.reduceMotion ? '1' : '0']);
    if (settings.lastBackupAt !== undefined && settings.lastBackupAt !== null) {
      if (!Number.isFinite(Date.parse(settings.lastBackupAt))) throw new ValidationError('Invalid backup time.');
      rows.push(['lastBackupAt', settings.lastBackupAt]);
    }
    return this.database.transaction(async sql => {
      for (const [key, value] of rows) await sql.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
    });
  }

  recurring(): Promise<RecurringRule[]> {
    return this.database.transaction(async sql => {
      const today = eventTime().localDate;
      const handled = new Set((await sql.getAllAsync<{ recurring_id: string; due_date: string }>('SELECT recurring_id, due_date FROM recurring_occurrences WHERE due_date >= ?', addDays(today, -LOOKBACK_DAYS)))
        .map(row => `${row.recurring_id}|${row.due_date}`));
      return (await sql.getAllAsync<RuleRow>(`${ruleSelect} ORDER BY r.paused, r.rowid`)).map(row => ({
        ...row, paused: row.paused === 1,
        nextDue: dueDates(row, addDays(today, -LOOKBACK_DAYS), addDays(today, 400)).find(date => !handled.has(`${row.id}|${date}`)) ?? null,
      }));
    });
  }

  saveRecurring(command: RecurringCommand): Promise<void> {
    assertId(command.id); assertId(command.walletId); assertId(command.categoryId); assertMinor(command.amountMinor);
    if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
    if (command.type !== 'expense' && command.type !== 'income') throw new ValidationError('Choose expense or income.');
    const name = command.name.trim();
    if (!name || name.length > 60) throw new ValidationError('Use a name between 1 and 60 characters.');
    assertSchedule(command);
    return this.database.transaction(async sql => {
      if (await activeBalance(sql, command.walletId) === null) throw new ValidationError('Choose an available wallet.');
      if (!await sql.getFirstAsync('SELECT id FROM categories WHERE id = ? AND profile_id = ? AND type = ?', command.categoryId, PROFILE, command.type)) {
        throw new ValidationError('Choose a category of the same type.');
      }
      await sql.runAsync(`INSERT INTO recurring (id, profile_id, name, type, amount_minor, account_id, category_id, frequency, every, start_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, amount_minor = excluded.amount_minor,
        account_id = excluded.account_id, category_id = excluded.category_id, frequency = excluded.frequency, every = excluded.every, start_date = excluded.start_date`,
      command.id, PROFILE, name, command.type, command.amountMinor, command.walletId, command.categoryId, command.frequency, command.every, command.startDate);
    });
  }

  setRecurringPaused(id: string, paused: boolean): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      const result = await sql.runAsync('UPDATE recurring SET paused = ? WHERE id = ? AND profile_id = ?', paused ? 1 : 0, id, PROFILE);
      if (!result.changes) throw new ValidationError('Recurring item not found.');
    });
  }

  // Past payments stay in history; only the schedule and its handled-occurrence marks go.
  deleteRecurring(id: string): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      await sql.runAsync('DELETE FROM recurring_occurrences WHERE recurring_id = ?', id);
      await sql.runAsync('DELETE FROM recurring WHERE id = ? AND profile_id = ?', id, PROFILE);
    });
  }

  // Records the real transaction and marks the occurrence paid in one database transaction.
  payRecurring(command: PayRecurringCommand): Promise<void> {
    assertEntryCommand(command); assertId(command.recurringId); assertLocalDate(command.dueDate);
    return this.database.transaction(async sql => {
      const occurrence = await sql.getFirstAsync<{ status: string; transaction_id: string | null }>(
        'SELECT status, transaction_id FROM recurring_occurrences WHERE recurring_id = ? AND due_date = ?', command.recurringId, command.dueDate);
      if (occurrence) {
        if (occurrence.status === 'paid' && occurrence.transaction_id === command.id) return; // A retry of this payment.
        throw new ValidationError('This payment was already handled.');
      }
      const rule = await sql.getFirstAsync<RuleRow>(`${ruleSelect} WHERE r.id = ?`, command.recurringId);
      if (!rule) throw new ValidationError('Recurring item not found.');
      if (!dueDates(rule, command.dueDate, command.dueDate).length) throw new ValidationError('That date is not on this schedule.');
      if (command.categoryId !== rule.categoryId) throw new ValidationError('Choose this item\'s category.');
      await postEntry(sql, command, rule.type);
      await sql.runAsync("INSERT INTO recurring_occurrences (recurring_id, due_date, status, transaction_id) VALUES (?, ?, 'paid', ?)", command.recurringId, command.dueDate, command.id);
    });
  }

  skipRecurring(recurringId: string, dueDate: string): Promise<void> {
    assertId(recurringId); assertLocalDate(dueDate);
    return this.database.transaction(async sql => {
      const rule = await sql.getFirstAsync<RuleRow>(`${ruleSelect} WHERE r.id = ?`, recurringId);
      if (!rule) throw new ValidationError('Recurring item not found.');
      if (!dueDates(rule, dueDate, dueDate).length) throw new ValidationError('That date is not on this schedule.');
      await sql.runAsync("INSERT OR IGNORE INTO recurring_occurrences (recurring_id, due_date, status) VALUES (?, ?, 'skipped')", recurringId, dueDate);
    });
  }

  saveGoal(command: GoalCommand): Promise<void> {
    assertId(command.id); assertMinor(command.targetMinor);
    if (command.targetMinor <= 0) throw new ValidationError('Target must be greater than zero.');
    const name = command.name.trim();
    if (!name || name.length > 60) throw new ValidationError('Use a name between 1 and 60 characters.');
    if (command.targetDate !== null) assertLocalDate(command.targetDate);
    if (!(categoryIconKeys as readonly string[]).includes(command.iconKey)) throw new ValidationError('Choose an icon.');
    if (!(categoryColorTokens as readonly string[]).includes(command.colorToken)) throw new ValidationError('Choose a color.');
    const description = command.description.trim();
    if (description.length > 500) throw new ValidationError('Keep the description within 500 characters.');
    // Photos are copies kept in the app's own storage.
    if (command.imageUri !== null && (command.imageUri.length > 1000 || !/^file:\/\/\S+$/.test(command.imageUri))) throw new ValidationError('Choose another photo.');
    return this.database.transaction(async sql => {
      if (!await sql.getFirstAsync('SELECT id FROM profiles WHERE id = ?', PROFILE)) throw new ValidationError('Create a wallet first.');
      await sql.runAsync(`INSERT INTO goals (id, profile_id, name, description, image_uri, target_minor, target_date, icon_key, color_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, image_uri = excluded.image_uri, target_minor = excluded.target_minor,
        target_date = excluded.target_date, icon_key = excluded.icon_key, color_token = excluded.color_token`,
      command.id, PROFILE, name, description, command.imageUri, command.targetMinor, command.targetDate, command.iconKey, command.colorToken);
    });
  }

  setGoalArchived(id: string, archived: boolean): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      const result = await sql.runAsync('UPDATE goals SET archived_at = ? WHERE id = ? AND profile_id = ?', archived ? new Date().toISOString() : null, id, PROFILE);
      if (!result.changes) throw new ValidationError('Goal not found.');
    });
  }

  deleteGoal(id: string): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      if (await sql.getFirstAsync('SELECT id FROM goal_contributions WHERE goal_id = ? AND transaction_id IS NOT NULL', id)) {
        throw new ValidationError("This goal has moved money with your wallets, so it can't be deleted. Archive it instead.");
      }
      await sql.runAsync('DELETE FROM goal_contributions WHERE goal_id = ?', id);
      await sql.runAsync('DELETE FROM goals WHERE id = ? AND profile_id = ?', id, PROFILE);
    });
  }

  goalContributions(goalId: string): Promise<GoalContribution[]> {
    assertId(goalId);
    return this.database.exclusive(sql => sql.getAllAsync<GoalContribution>(`SELECT c.id, c.goal_id AS goalId, c.amount_minor AS amountMinor, c.local_date AS localDate,
      c.note, a.id AS walletId, a.name AS walletName FROM goal_contributions c LEFT JOIN entries e ON e.transaction_id = c.transaction_id
      LEFT JOIN accounts a ON a.id = e.account_id WHERE c.goal_id = ? ORDER BY c.local_date DESC, c.rowid DESC`, goalId));
  }

  // Moves money between a wallet and a goal in one transaction: positive from the wallet into the goal,
  // negative back out to the wallet. The goal may not go below zero. Retries are harmless.
  addContribution(command: ContributionCommand): Promise<void> {
    assertId(command.id); assertId(command.goalId); assertId(command.walletId); assertMinor(command.amountMinor); assertEventTime(command);
    if (command.amountMinor === 0) throw new ValidationError('Amount must not be zero.');
    const note = command.note.trim();
    if (note.length > 200) throw new ValidationError('Keep notes within 200 characters.');
    return this.database.transaction(async sql => {
      const existing = await sql.getFirstAsync<{ goal_id: string; amount_minor: number; account_id: string | null }>(`SELECT c.goal_id, c.amount_minor, e.account_id
        FROM goal_contributions c LEFT JOIN entries e ON e.transaction_id = c.transaction_id WHERE c.id = ?`, command.id);
      if (existing) {
        if (existing.goal_id === command.goalId && existing.amount_minor === command.amountMinor && existing.account_id === command.walletId) return;
        throw new ValidationError('This request identifier was already used.');
      }
      if (await sql.getFirstAsync('SELECT id FROM transactions WHERE id = ?', command.id)) throw new ValidationError('This request identifier was already used.');
      const goal = await sql.getFirstAsync<{ saved: number; archived_at: string | null }>(`SELECT g.archived_at,
        COALESCE((SELECT SUM(amount_minor) FROM goal_contributions WHERE goal_id = g.id), 0) AS saved FROM goals g WHERE g.id = ? AND g.profile_id = ?`, command.goalId, PROFILE);
      if (!goal) throw new ValidationError('Goal not found.');
      if (goal.archived_at && command.amountMinor > 0) throw new ValidationError('Restore this goal to add money.');
      if (addMinor(goal.saved, command.amountMinor) < 0) throw new ValidationError("You can't take out more than is saved.");
      const balance = await activeBalance(sql, command.walletId);
      if (balance === null) throw new ValidationError('Choose an available wallet.');
      addMinor(balance, -command.amountMinor);
      await sql.runAsync(`INSERT INTO transactions (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id)
        VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, NULL)`, command.id, PROFILE, command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes, note);
      await sql.runAsync('INSERT INTO entries (id, transaction_id, profile_id, account_id, amount_minor) VALUES (?, ?, ?, ?, ?)', command.id, command.id, PROFILE, command.walletId, -command.amountMinor);
      await sql.runAsync('INSERT INTO goal_contributions (id, goal_id, amount_minor, local_date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
        command.id, command.goalId, command.amountMinor, command.localDate, note, command.id);
    });
  }

  deleteContribution(id: string): Promise<void> {
    assertId(id);
    return this.database.transaction(async sql => {
      const row = await sql.getFirstAsync<{ goal_id: string; amount_minor: number; transaction_id: string | null }>('SELECT goal_id, amount_minor, transaction_id FROM goal_contributions WHERE id = ?', id);
      if (!row) return;
      const saved = (await sql.getFirstAsync<{ saved: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS saved FROM goal_contributions WHERE goal_id = ?', row.goal_id))?.saved ?? 0;
      if (saved - row.amount_minor < 0) throw new ValidationError('Removing this would make the saved total negative.');
      await sql.runAsync('DELETE FROM goal_contributions WHERE id = ?', id);
      // The wallet side goes too, so the money returns to (or leaves) the wallet it came from.
      if (row.transaction_id) {
        for (const entry of await sql.getAllAsync<{ account_id: string; amount_minor: number }>('SELECT account_id, amount_minor FROM entries WHERE transaction_id = ?', row.transaction_id)) {
          addMinor(await walletBalance(sql, entry.account_id), -entry.amount_minor);
        }
        await sql.runAsync('DELETE FROM entries WHERE transaction_id = ?', row.transaction_id);
        await sql.runAsync('DELETE FROM transactions WHERE id = ?', row.transaction_id);
      }
    });
  }

  exportBackup(appVersion: string): Promise<BackupEnvelope> {
    return this.database.transaction(async sql => envelopeOf(await readRecords(sql), appVersion));
  }

  restoreBackup(envelope: BackupEnvelope): Promise<void> {
    const { envelope: checked } = validateBackup(envelope);
    return this.database.transaction(async sql => {
      // The current data becomes the undo point, committed together with the replacement.
      const safety = envelopeOf(await readRecords(sql), checked.appVersion);
      await sql.runAsync('INSERT OR REPLACE INTO restore_snapshots (id, created_at, payload) VALUES (1, ?, ?)', safety.exportedAt, JSON.stringify(safety));
      await replaceRecords(sql, checked.records);
    });
  }

  undoRestore(): Promise<void> {
    return this.database.transaction(async sql => {
      const row = await sql.getFirstAsync<{ payload: string }>('SELECT payload FROM restore_snapshots WHERE id = 1');
      if (!row) throw new ValidationError('There is no restore to undo.');
      const { envelope } = validateBackup(JSON.parse(row.payload));
      await replaceRecords(sql, envelope.records);
      await sql.runAsync('DELETE FROM restore_snapshots WHERE id = 1');
    });
  }
}
