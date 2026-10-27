import { validateWalletName } from '../domain/wallet-name';
import type { ActivityItem, EntryCommand, LedgerRepository, OpeningCommand, Overview, Wallet } from '../domain/ledger';
import { assertEventTime, eventTime } from '../domain/date';
import { addMinor, assertMinor, ValidationError } from '../domain/money';
import { migrate, seedIncomeCategories } from './migrations';
import { Database, type SqlConnection } from './sql';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const categories = [
  ['Food & drink', 'food'], ['Transport', 'transport'], ['Shopping', 'shopping'],
  ['Bills', 'bills'], ['Health', 'health'], ['Other', 'other'],
];

type Existing = {
  type: string; account_id: string; category_id: string | null; amount_minor: number;
  note: string; occurred_at: string; local_date: string; time_zone: string; offset_minutes: number;
  wallet_name: string; wallet_kind: string;
};
const activitySelect = `SELECT t.id, t.type, t.occurred_at AS occurredAt,
  t.local_date AS localDate, t.time_zone AS timeZone, t.offset_minutes AS offsetMinutes,
  t.note, e.amount_minor AS amountMinor, a.name AS walletName, c.name AS categoryName
  FROM transactions t JOIN entries e ON e.transaction_id = t.id
  JOIN accounts a ON a.id = e.account_id LEFT JOIN categories c ON c.id = t.category_id`;
const activityOrder = ' ORDER BY t.local_date DESC, t.occurred_at DESC, t.id DESC LIMIT ? OFFSET ?';
const activityQuery = activitySelect + activityOrder;

function assertId(id: string): void {
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) {
    throw new ValidationError('Invalid record identifier.');
  }
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

async function insertTransaction(sql: SqlConnection, command: EntryCommand | OpeningCommand, type: 'expense' | 'income' | 'opening'): Promise<void> {
  const hasCategory = 'categoryId' in command;
  await sql.runAsync(`INSERT INTO transactions
    (id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, command.id, PROFILE, type,
  command.occurredAt, command.localDate, command.timeZone, command.offsetMinutes,
  hasCategory ? command.note : '', hasCategory ? command.categoryId : null);
  await sql.runAsync(`INSERT INTO entries (id, transaction_id, profile_id, account_id, amount_minor)
    VALUES (?, ?, ?, ?, ?)`, command.id, command.id, PROFILE, command.walletId,
  type === 'expense' ? -command.amountMinor : command.amountMinor);
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
      const balance = await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM entries');
      const wallets = allWallets.filter(wallet => !wallet.archivedAt);
      const archivedWallets = allWallets.filter(wallet => Boolean(wallet.archivedAt));
      const today = await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(-SUM(e.amount_minor), 0) AS amount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'expense' AND t.local_date = ?`, eventTime().localDate);
      const todayIncome = await sql.getFirstAsync<{ amount: number }>(`SELECT COALESCE(SUM(e.amount_minor), 0) AS amount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'income' AND t.local_date = ?`, eventTime().localDate);
      const totals = await sql.getFirstAsync<{ spentMinor: number; expenseCount: number }>(`
        SELECT COALESCE(-SUM(e.amount_minor), 0) AS spentMinor, COUNT(*) AS expenseCount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'expense'`);
      const income = await sql.getFirstAsync<{ amount: number; count: number }>("SELECT COALESCE(SUM(e.amount_minor), 0) AS amount, COUNT(*) AS count FROM transactions t JOIN entries e ON e.transaction_id = t.id WHERE t.type = 'income'");
      return {
        todayIncomeMinor: assertMinor(todayIncome?.amount ?? 0),
        incomeMinor: assertMinor(income?.amount ?? 0), incomeCount: income?.count ?? 0,
        incomeCategories: await sql.getAllAsync("SELECT id, name, icon_key AS iconKey FROM categories WHERE type = 'income' AND archived_at IS NULL ORDER BY rowid"),
        wallet: wallets[0] ?? null, wallets, archivedWallets, totalBalanceMinor: assertMinor(balance?.amount ?? 0), todaySpentMinor: assertMinor(today?.amount ?? 0), spentMinor: assertMinor(totals?.spentMinor ?? 0), expenseCount: totals?.expenseCount ?? 0,
        categories: await sql.getAllAsync("SELECT id, name, icon_key AS iconKey FROM categories WHERE type = 'expense' AND archived_at IS NULL ORDER BY rowid"),
        recent: await sql.getAllAsync<ActivityItem>(activityQuery, 5, 0),
      };
    });
  }

  history(offset: number, limit: number, walletId?: string): Promise<ActivityItem[]> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return Promise.reject(new ValidationError('Invalid history page.'));
    }
    if (walletId !== undefined) {
      assertId(walletId);
      return this.database.exclusive(sql => sql.getAllAsync(activitySelect + ' WHERE a.id = ?' + activityOrder, walletId, limit, offset));
    }
    return this.database.exclusive(sql => sql.getAllAsync(activityQuery, limit, offset));
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
      const balance = await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM entries');
      addMinor(balance?.amount ?? 0, command.amountMinor);
      const profile = await sql.getFirstAsync('SELECT id FROM profiles WHERE id = ?', PROFILE);
      if (!profile) {
        await sql.runAsync('INSERT INTO profiles VALUES (?, ?, ?)', PROFILE, 'PHP', command.timeZone);
        for (const [index, [categoryName, icon]] of categories.entries()) {
          const id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`;
          await sql.runAsync("INSERT INTO categories (id, profile_id, type, name, icon_key, color_token) VALUES (?, ?, 'expense', ?, ?, 'accent')",
            id, PROFILE, categoryName, icon);
        }
      }
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
    if (command.note.length > 500) throw new ValidationError('Keep notes within 500 characters.');
    return this.database.transaction(async sql => {
      if (await alreadyPosted(sql, command, type)) return;
      const account = await sql.getFirstAsync<{ balance: number }>(`
        SELECT COALESCE(SUM(e.amount_minor), 0) AS balance FROM accounts a
        LEFT JOIN entries e ON e.account_id = a.id WHERE a.id = ? AND a.profile_id = ? AND a.archived_at IS NULL GROUP BY a.id`,
      command.walletId, PROFILE);
      if (!account) throw new ValidationError('Choose an available wallet.');
      if (!await sql.getFirstAsync("SELECT id FROM categories WHERE id = ? AND profile_id = ? AND type = ? AND archived_at IS NULL", command.categoryId, PROFILE, type)) {
        throw new ValidationError('Choose an available category.');
      }
      const signed = type === 'expense' ? -command.amountMinor : command.amountMinor;
      addMinor(account.balance, signed);
      const balance = await sql.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(amount_minor), 0) AS amount FROM entries');
      addMinor(balance?.amount ?? 0, signed);
      const spent = await sql.getFirstAsync<{ amount: number }>(`
        SELECT COALESCE(SUM(abs(e.amount_minor)), 0) AS amount FROM entries e
        JOIN transactions t ON t.id = e.transaction_id WHERE t.type = ?`, type);
      addMinor(spent?.amount ?? 0, command.amountMinor);
      await insertTransaction(sql, command, type);
    });
  }
}
