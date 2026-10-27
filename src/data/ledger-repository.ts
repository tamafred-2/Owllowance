import { validateWalletName } from '../domain/wallet-name';
import type {
  ActivityItem, Budget, BudgetCommand, CategoryCommand, EditEntryCommand, EntryCommand, HistoryFilter, LedgerRepository,
  ManagedCategory, OpeningCommand, Overview, Report, Settings, TransferCommand, Wallet,
} from '../domain/ledger';
import { defaultSettings } from '../domain/ledger';
import { assertEventTime, assertLocalDate, eventTime } from '../domain/date';
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
  CASE WHEN t.type = 'transfer' THEN (SELECT a2.name FROM entries e2 JOIN accounts a2 ON a2.id = e2.account_id
    WHERE e2.transaction_id = t.id AND e2.id <> e.id) END AS counterpartyName,
  CASE WHEN t.type = 'transfer' THEN (SELECT -SUM(e4.amount_minor) FROM transactions t4 JOIN entries e4 ON e4.transaction_id = t4.id
    WHERE t4.linked_id = t.id AND e4.account_id = e.account_id) END AS feeMinor
  FROM transactions t JOIN entries e ON e.transaction_id = t.id
  JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = t.category_id`;
// Without a wallet filter a transfer appears once, from its source side.
const singleTransferRow = "NOT (t.type = 'transfer' AND e.amount_minor > 0)";
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
    // Wallet names match either side of a transfer.
    conditions.push(`(t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM entries e3
      JOIN accounts a3 ON a3.id = e3.account_id WHERE e3.transaction_id = t.id AND a3.name LIKE ? ESCAPE '\\'))`);
    params.push(pattern, pattern, pattern);
  }
  return { clause: ` WHERE ${conditions.join(' AND ')}`, params };
}

async function readSettings(sql: SqlConnection): Promise<Settings> {
  const rows = await sql.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    theme: values.theme === 'light' || values.theme === 'dark' ? values.theme : defaultSettings.theme,
    hideBalances: values.hideBalances === '1',
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
  await sql.execAsync(`DELETE FROM budgets; DELETE FROM entries; DELETE FROM transactions WHERE linked_id IS NOT NULL;
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
  await insert('settings', records.settings.filter(row => ['theme', 'hideBalances', 'reduceMotion', 'lastBackupAt'].includes(String(row.key))));
  if ((await sql.getAllAsync('PRAGMA foreign_key_check')).length) throw new ValidationError("This backup can't be restored: its records don't match.");
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
        wallet: wallets[0] ?? null, wallets, archivedWallets, totalBalanceMinor: assertMinor(await totalBalance(sql)), todaySpentMinor: assertMinor(todaySpent?.amount ?? 0), spentMinor: assertMinor(totals?.spentMinor ?? 0), expenseCount: totals?.expenseCount ?? 0,
        categories: await sql.getAllAsync("SELECT id, name, icon_key AS iconKey, color_token AS colorToken FROM categories WHERE type = 'expense' AND archived_at IS NULL ORDER BY rowid"),
        recent: await sql.getAllAsync<ActivityItem>(activityQuery, 5, 0),
        budgets, settings: await readSettings(sql),
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
    assertId(command.id); assertId(command.walletId); assertId(command.categoryId); assertEventTime(command); assertMinor(command.amountMinor);
    if (command.amountMinor <= 0) throw new ValidationError('Amount must be greater than zero.');
    assertNote(command.note);
    return this.database.transaction(async sql => {
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
        -SUM(e.amount_minor) AS amountMinor FROM transactions t JOIN entries e ON e.transaction_id = t.id JOIN categories c ON c.id = t.category_id
        WHERE t.type = 'expense' AND t.local_date >= ? AND t.local_date < ? GROUP BY c.id ORDER BY amountMinor DESC, c.name`, fromDate, toDateExclusive);
      return { incomeMinor: assertMinor(sums?.income ?? 0), expenseMinor: assertMinor(sums?.expense ?? 0), byCategory };
    });
  }

  saveSettings(settings: Partial<Settings>): Promise<void> {
    const rows: [string, string][] = [];
    if (settings.theme !== undefined) {
      if (!['system', 'light', 'dark'].includes(settings.theme)) throw new ValidationError('Choose a theme.');
      rows.push(['theme', settings.theme]);
    }
    if (settings.hideBalances !== undefined) rows.push(['hideBalances', settings.hideBalances ? '1' : '0']);
    if (settings.reduceMotion !== undefined) rows.push(['reduceMotion', settings.reduceMotion ? '1' : '0']);
    if (settings.lastBackupAt !== undefined && settings.lastBackupAt !== null) {
      if (!Number.isFinite(Date.parse(settings.lastBackupAt))) throw new ValidationError('Invalid backup time.');
      rows.push(['lastBackupAt', settings.lastBackupAt]);
    }
    return this.database.transaction(async sql => {
      for (const [key, value] of rows) await sql.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
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
