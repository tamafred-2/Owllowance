import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Database } from '../src/data/sql';
import { SqlLedgerRepository } from '../src/data/ledger-repository';
import type { TransferCommand } from '../src/domain/ledger';
import { budgetWindow } from '../src/domain/budget';
import { addDays, eventTime, eventTimeOn, weekStart } from '../src/domain/date';
import { fixture, opening, time } from './sqlite-fixture';
import { parseBackup, validateBackup } from '../src/domain/backup';
import { transactionsCsv } from '../src/domain/csv';

async function twoWallets() {
  const f = await fixture();
  const savings = { ...opening(50_000), walletName: 'Savings', walletKind: 'bank' as const };
  await f.repository.createWallet(savings);
  const transfer = (amountMinor: number, feeMinor = 0): TransferCommand => ({
    id: randomUUID(), toEntryId: randomUUID(), feeId: randomUUID(), fromWalletId: f.setup.walletId, toWalletId: savings.walletId,
    amountMinor, feeMinor, note: 'Move', ...time,
  });
  const balances = async () => Object.fromEntries((await f.repository.overview()).wallets.map(wallet => [wallet.name, wallet.balanceMinor]));
  return { ...f, savings, transfer, balances };
}

test('transfer moves money atomically, records fee as linked expense and excludes principal from income/spending', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const command = f.transfer(20_000, 1_500);
  await f.repository.addTransfer(command);
  await f.repository.addTransfer(command); // Retry is idempotent.
  assert.deepEqual(await f.balances(), { Cash: 78_500, Savings: 70_000 });
  const view = await f.repository.overview();
  assert.equal(view.totalBalanceMinor, 148_500);
  assert.equal(view.spentMinor, 1_500); assert.equal(view.incomeMinor, 0);
  const all = await f.repository.history(0, 20);
  const transferRows = all.filter(item => item.type === 'transfer');
  assert.equal(transferRows.length, 1);
  assert.deepEqual([transferRows[0].walletName, transferRows[0].counterpartyName, transferRows[0].amountMinor], ['Cash', 'Savings', -20_000]);
  assert.equal(all.some(item => item.linkedId), false); // Fee folds into its transfer row.
  assert.equal(transferRows[0].feeMinor, 1_500);
  const fee = (await f.repository.history(0, 20, { type: 'expense' })).find(item => item.linkedId === command.id);
  assert.equal(fee?.categoryName, 'Fees'); assert.equal(fee?.amountMinor, -1_500);
  assert.equal((await f.repository.history(0, 20, { separateFees: true })).length, all.length + 1);
  const savingsHistory = await f.repository.history(0, 20, f.savings.walletId);
  assert.deepEqual(savingsHistory.filter(item => item.type === 'transfer').map(item => [item.amountMinor, item.counterpartyName, item.feeMinor]), [[20_000, 'Cash', null]]);
  const cashHistory = await f.repository.history(0, 20, f.setup.walletId);
  assert.deepEqual(cashHistory.filter(item => item.type === 'transfer').map(item => [item.amountMinor, item.feeMinor]), [[-20_000, 1_500]]);
  assert.equal(cashHistory.length, 2); // Opening + transfer; the fee is folded in.
  const report = await f.repository.report(time.localDate, addDays(time.localDate, 1));
  assert.deepEqual([report.incomeMinor, report.expenseMinor], [0, 1_500]);
  await assert.rejects(f.repository.addTransfer({ ...command, amountMinor: 20_001 }), /different transaction/);
});

test('transfer validation and mid-write failure leave balances unchanged', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  assert.throws(() => f.repository.addTransfer({ ...f.transfer(100), toWalletId: f.setup.walletId }), /different wallets/);
  assert.throws(() => f.repository.addTransfer(f.transfer(0)), /greater than zero/);
  assert.throws(() => f.repository.addTransfer(f.transfer(100, -1)), /negative/);
  assert.throws(() => f.repository.addTransfer(f.transfer(100, 101)), /more than the amount/);
  await f.repository.addTransfer(f.transfer(100, 100)); // A fee equal to the amount is allowed.
  await f.repository.deleteTransaction((await f.repository.history(0, 1, { type: 'transfer' }))[0].id, 1);
  const failing = f.transfer(10_000, 500);
  f.connection.failEntryAt = 2; // The destination entry fails after the source entry was written.
  await assert.rejects(f.repository.addTransfer(failing), /Injected/);
  assert.deepEqual(await f.balances(), { Cash: 100_000, Savings: 50_000 });
  assert.equal((await f.repository.history(0, 20)).length, 2);
  await f.repository.addTransfer(failing); // Same request succeeds exactly once afterwards.
  assert.deepEqual(await f.balances(), { Cash: 89_500, Savings: 60_000 });
  await f.repository.setWalletArchived(f.savings.walletId, true);
  await assert.rejects(f.repository.addTransfer(f.transfer(100)), /available wallets/);
});

test('deleting a transfer removes its fee; protected and stale deletes are refused', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const command = f.transfer(5_000, 200);
  await f.repository.addTransfer(command);
  await assert.rejects(f.repository.deleteTransaction(command.feeId, 1), /Delete the transfer/);
  await assert.rejects(f.repository.deleteTransaction(f.setup.id, 1), /Opening balances/);
  await assert.rejects(f.repository.deleteTransaction(command.id, 2), /changed/);
  await f.repository.deleteTransaction(command.id, 1);
  await f.repository.deleteTransaction(command.id, 1); // Repeated delete is harmless.
  assert.deepEqual(await f.balances(), { Cash: 100_000, Savings: 50_000 });
  assert.equal((await f.repository.overview()).spentMinor, 0);
  assert.equal(f.connection.sqlite.prepare('SELECT COUNT(*) AS n FROM entries').get()?.n, 2);
});

test('editing an entry updates wallet, amount, category and date atomically with revision checks', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const expense = f.expense(3_000);
  await f.repository.addExpense(expense);
  const categories = (await f.repository.overview()).categories;
  const yesterday = { ...time, localDate: addDays(time.localDate, -1), occurredAt: '2026-10-13T04:00:00.000Z' };
  await f.repository.updateEntry({ ...expense, ...yesterday, walletId: f.savings.walletId, categoryId: categories[1].id, amountMinor: 4_500, note: 'Fixed', revision: 1 });
  assert.deepEqual(await f.balances(), { Cash: 100_000, Savings: 45_500 });
  const edited = await f.repository.transaction(expense.id);
  assert.deepEqual([edited?.revision, edited?.localDate, edited?.categoryName, edited?.note, edited?.amountMinor], [2, '2026-10-13', categories[1].name, 'Fixed', -4_500]);
  await assert.rejects(f.repository.updateEntry({ ...expense, revision: 1 }), /changed/);
  const income = (await f.repository.overview()).incomeCategories[0];
  await assert.rejects(f.repository.updateEntry({ ...expense, categoryId: income.id, revision: 2 }), /available category/);
  await f.repository.setWalletArchived(f.setup.walletId, true);
  await assert.rejects(f.repository.updateEntry({ ...expense, revision: 2 }), /available wallet/);
  const transfer = f.transfer(100, 10);
  await f.repository.setWalletArchived(f.setup.walletId, false);
  await f.repository.addTransfer(transfer);
  await assert.rejects(f.repository.updateEntry({ ...expense, id: transfer.feeId, revision: 1 }), /fees change/);
  await assert.rejects(f.repository.updateEntry({ ...expense, id: transfer.id, revision: 1 }), /Only income and expenses/);
  assert.deepEqual(await f.balances(), { Cash: 99_890, Savings: 45_600 });
});

test('custom categories: unique names, archive keeps history, last active category stays', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const id = randomUUID();
  await f.repository.saveCategory({ id, type: 'expense', name: 'Coffee', iconKey: 'coffee', colorToken: 'amber' });
  await assert.rejects(f.repository.saveCategory({ id: randomUUID(), type: 'expense', name: ' coffee ', iconKey: 'coffee', colorToken: 'amber' }), /already exists/);
  await f.repository.saveCategory({ id: randomUUID(), type: 'income', name: 'Coffee', iconKey: 'income', colorToken: 'teal' }); // Other type may reuse.
  assert.throws(() => f.repository.saveCategory({ id: randomUUID(), type: 'expense', name: 'X', iconKey: 'rocket', colorToken: 'amber' }), /icon/);
  await f.repository.addExpense({ ...f.expense(700), categoryId: id });
  await f.repository.saveCategory({ id, type: 'expense', name: 'Cafe', iconKey: 'coffee', colorToken: 'rose' });
  await assert.rejects(f.repository.saveCategory({ id, type: 'income', name: 'Cafe', iconKey: 'coffee', colorToken: 'rose' }), /keeps its type/);
  await f.repository.setCategoryArchived(id, true);
  assert.equal((await f.repository.history(0, 10, { categoryId: id }))[0].categoryName, 'Cafe');
  await assert.rejects(f.repository.addExpense({ ...f.expense(1), categoryId: id }), /available category/);
  const managed = await f.repository.categories();
  assert.equal(managed.find(item => item.id === id)?.custom, true);
  assert.equal(managed.find(item => item.name === 'Fees')?.custom, false);
  const incomeIds = managed.filter(item => item.type === 'income').map(item => item.id);
  for (const incomeId of incomeIds.slice(1)) await f.repository.setCategoryArchived(incomeId, true);
  await assert.rejects(f.repository.setCategoryArchived(incomeIds[0], true), /at least one/);
});

test('budgets track posted expenses in their window, exclude transfers and enforce one per category', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const today = eventTime();
  const food = (await f.repository.overview()).categories[0];
  await f.repository.addExpense({ ...f.expense(2_500), ...today });
  await f.repository.addExpense({ ...f.expense(1_000), ...eventTimeOn(addDays(today.localDate, -40)) });
  await f.repository.addTransfer({ ...f.transfer(9_000), ...today });
  const id = randomUUID();
  await f.repository.saveBudget({ id, categoryId: food.id, period: 'monthly', startDate: null, endDate: null, limitMinor: 10_000 });
  let budget = (await f.repository.overview()).budgets[0];
  assert.deepEqual([budget.spentMinor, budget.limitMinor, budget.windowStart], [2_500, 10_000, `${today.localDate.slice(0, 7)}-01`]);
  await f.repository.saveBudget({ id, categoryId: food.id, period: 'custom', startDate: addDays(today.localDate, -45), endDate: addDays(today.localDate, 1), limitMinor: 5_000 });
  budget = (await f.repository.overview()).budgets[0];
  assert.deepEqual([budget.period, budget.spentMinor], ['custom', 3_500]);
  await assert.rejects(f.repository.saveBudget({ id: randomUUID(), categoryId: food.id, period: 'weekly', startDate: null, endDate: null, limitMinor: 1 }), /already has a budget/);
  const salary = (await f.repository.overview()).incomeCategories[0];
  await assert.rejects(f.repository.saveBudget({ id: randomUUID(), categoryId: salary.id, period: 'weekly', startDate: null, endDate: null, limitMinor: 1 }), /expense category/);
  assert.throws(() => f.repository.saveBudget({ id, categoryId: food.id, period: 'custom', startDate: '2026-10-10', endDate: '2026-10-10', limitMinor: 1 }), /after the start/);
  await f.repository.deleteBudget(id);
  assert.equal((await f.repository.overview()).budgets.length, 0);
});

test('budget windows use local calendar months/weeks including year and leap boundaries', () => {
  assert.deepEqual(budgetWindow('monthly', null, null, '2028-02-29'), { start: '2028-02-01', end: '2028-03-01' });
  assert.deepEqual(budgetWindow('monthly', null, null, '2026-12-31'), { start: '2026-12-01', end: '2027-01-01' });
  assert.deepEqual(budgetWindow('weekly', null, null, '2027-01-01'), { start: '2026-12-28', end: '2027-01-04' });
  assert.equal(weekStart('2026-10-26'), '2026-10-26'); // Monday stays.
  assert.throws(() => eventTimeOn(addDays(eventTime().localDate, 1)), /today or an earlier/);
});

test('history filters combine type, category, wallet, date range and literal search', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const view = await f.repository.overview();
  await f.repository.addExpense({ ...f.expense(100), note: '100% beans' });
  await f.repository.addExpense({ ...f.expense(200), categoryId: view.categories[1].id, ...time, localDate: '2026-10-01', occurredAt: '2026-10-01T04:00:00.000Z' });
  await f.repository.addIncome({ ...f.expense(900), categoryId: view.incomeCategories[0].id });
  await f.repository.addTransfer(f.transfer(50));
  assert.equal((await f.repository.history(0, 20, { type: 'expense' })).length, 2);
  assert.equal((await f.repository.history(0, 20, { type: 'transfer' })).length, 1);
  assert.equal((await f.repository.history(0, 20, { type: 'transfer', walletId: f.savings.walletId }))[0].amountMinor, 50);
  assert.equal((await f.repository.history(0, 20, { categoryId: view.categories[1].id }))[0].amountMinor, -200);
  assert.equal((await f.repository.history(0, 20, { fromDate: '2026-10-02', type: 'expense' })).length, 1);
  assert.equal((await f.repository.history(0, 20, { toDateExclusive: '2026-10-02' })).length, 1);
  assert.equal((await f.repository.history(0, 20, { search: '100%' })).length, 1);
  assert.equal((await f.repository.history(0, 20, { search: '%' })).length, 1); // Wildcards are literal.
  assert.equal((await f.repository.history(0, 20, { search: 'savings' })).length, 2); // Wallet name matches opening + transfer row.
});

test('settings persist with validated values; each balance is hidden independently', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  assert.deepEqual((await f.repository.overview()).settings, { theme: 'system', walletView: 'grid', deckWallet: null, hiddenBalances: [], reduceMotion: false, lastBackupAt: null });
  await f.repository.saveSettings({ theme: 'dark', walletView: 'cards', deckWallet: f.setup.walletId, lastBackupAt: '2026-10-27T01:00:00.000Z' });
  await f.repository.setBalanceHidden(f.setup.walletId, true);
  await f.repository.setBalanceHidden('net-worth', true);
  await f.repository.setBalanceHidden('net-worth', false);
  assert.deepEqual((await f.repository.overview()).settings, { theme: 'dark', walletView: 'cards', deckWallet: f.setup.walletId, hiddenBalances: [f.setup.walletId], reduceMotion: false, lastBackupAt: '2026-10-27T01:00:00.000Z' });
  assert.throws(() => f.repository.setBalanceHidden('everything', true), /identifier/);
  assert.throws(() => f.repository.saveSettings({ theme: 'neon' as 'dark' }), /theme/);
  assert.throws(() => f.repository.saveSettings({ walletView: 'tiles' as 'grid' }), /wallet view/);
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  await f.repository.setBalanceHidden(f.setup.walletId, false);
  await f.repository.restoreBackup(backup);
  assert.deepEqual((await f.repository.overview()).settings.hiddenBalances, [f.setup.walletId]); // Survives backup/restore.
});

test('v3 database upgrades to v4 preserving records; interrupted upgrade rolls back', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  await f.repository.addExpense({ ...f.expense(1_250), note: 'Existing meal' });
  const columns = 'id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision';
  // Recreate the v3 shape: one entry per transaction, no linked fees, budgets or settings.
  f.connection.sqlite.exec(`
    CREATE TEMP TABLE t3 AS SELECT ${columns} FROM transactions; CREATE TEMP TABLE e3 AS SELECT * FROM entries;
    DROP TABLE entries; DROP TABLE transactions; DROP TABLE budgets; DROP TABLE settings; DROP TABLE restore_snapshots;
    CREATE TABLE transactions (id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
      type TEXT NOT NULL CHECK (type IN ('expense','income','opening')), occurred_at TEXT NOT NULL, local_date TEXT NOT NULL,
      time_zone TEXT NOT NULL, offset_minutes INTEGER NOT NULL, note TEXT NOT NULL, category_id TEXT,
      revision INTEGER NOT NULL DEFAULT 1, FOREIGN KEY (category_id, profile_id) REFERENCES categories(id, profile_id), UNIQUE (id, profile_id));
    CREATE TABLE entries (id TEXT PRIMARY KEY NOT NULL, transaction_id TEXT NOT NULL UNIQUE, profile_id TEXT NOT NULL, account_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL, FOREIGN KEY (transaction_id, profile_id) REFERENCES transactions(id, profile_id),
      FOREIGN KEY (account_id, profile_id) REFERENCES accounts(id, profile_id));
    INSERT INTO transactions SELECT * FROM t3; INSERT INTO entries SELECT * FROM e3; DROP TABLE t3; DROP TABLE e3;
    DELETE FROM categories WHERE name = 'Fees'; DELETE FROM schema_migrations WHERE version = 4; PRAGMA user_version = 3;`);
  const before = f.connection.sqlite.prepare(`SELECT ${columns} FROM transactions ORDER BY id`).all();
  const repository = new SqlLedgerRepository(new Database(f.connection));
  f.connection.failV4Migration = true;
  await assert.rejects(repository.initialize(), /Injected v4/);
  assert.equal(f.connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 3);
  assert.deepEqual(f.connection.sqlite.prepare(`SELECT ${columns} FROM transactions ORDER BY id`).all(), before);
  await repository.initialize(); await repository.initialize();
  assert.equal(f.connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 4);
  assert.deepEqual(f.connection.sqlite.prepare(`SELECT ${columns} FROM transactions ORDER BY id`).all(), before);
  const view = await repository.overview();
  assert.deepEqual([view.totalBalanceMinor, view.spentMinor], [98_750, 1_250]);
  assert.ok(view.categories.some(category => category.name === 'Fees'));
  assert.deepEqual(f.connection.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('backup round-trips every record; restore is atomic with an undo point', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  await f.repository.addExpense({ ...f.expense(1_000), note: 'Lunch' });
  await f.repository.addTransfer(f.transfer(2_000, 100));
  await f.repository.saveBudget({ id: randomUUID(), categoryId: (await f.repository.overview()).categories[0].id, period: 'weekly', startDate: null, endDate: null, limitMinor: 5_000 });
  await f.repository.saveSettings({ theme: 'dark' });
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  const { preview } = parseBackup(JSON.stringify(backup));
  assert.deepEqual([preview.wallets, preview.transactions, preview.budgets, preview.totalBalanceMinor], [2, 3, 1, 148_900]);
  const target = await fixture(); t.after(() => target.connection.sqlite.close());
  await target.repository.addExpense(target.expense(5));
  await target.repository.restoreBackup(backup);
  const restored = await target.repository.overview();
  assert.deepEqual(restored.wallets.map(wallet => [wallet.name, wallet.balanceMinor]), [['Cash', 96_900], ['Savings', 52_000]]);
  assert.deepEqual([restored.budgets.length, restored.settings.theme, restored.spentMinor], [1, 'dark', 1_100]);
  assert.ok(restored.restoreSnapshotAt);
  assert.deepEqual(JSON.parse(JSON.stringify((await target.repository.exportBackup('test')).records)), backup.records);
  await target.repository.undoRestore();
  const undone = await target.repository.overview();
  assert.deepEqual([undone.totalBalanceMinor, undone.spentMinor, undone.restoreSnapshotAt], [99_995, 5, null]);
  await assert.rejects(target.repository.undoRestore(), /no restore/);
});

test('corrupt or unsupported backups are rejected before live data changes', async t => {
  const f = await twoWallets(); t.after(() => f.connection.sqlite.close());
  const good = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  const tamper = (change: (copy: typeof good) => void) => { const copy = JSON.parse(JSON.stringify(good)); change(copy); return copy; };
  assert.throws(() => parseBackup('{not json'), /damaged/);
  assert.throws(() => validateBackup({ ...good, format: 'other' }), /not an Owllowance backup/);
  assert.throws(() => validateBackup({ ...good, schemaVersion: 99 }), /unsupported version/);
  assert.throws(() => validateBackup(tamper(copy => { copy.records.entries[0].account_id = randomUUID(); })), /missing record/);
  assert.throws(() => validateBackup(tamper(copy => { copy.records.entries[0].amount_minor = 1.5; })), /invalid amount_minor/);
  assert.throws(() => validateBackup(tamper(copy => { copy.records.accounts.push(copy.records.accounts[0]); })), /duplicate/);
  assert.throws(() => validateBackup(tamper(copy => { copy.records.entries[0].extra = 1; })), /unexpected fields/);
  // Passes shape checks but violates a database rule (expense with positive entry): rolled back intact.
  const before = await f.repository.exportBackup('test');
  const bad = tamper(copy => {
    const expense = copy.records.transactions.find((row: { type: string }) => row.type === 'opening');
    expense.type = 'expense'; expense.category_id = copy.records.categories[0].id;
  });
  await assert.rejects(f.repository.restoreBackup(bad), /invalid entry sign/);
  assert.deepEqual(JSON.stringify((await f.repository.exportBackup('test')).records), JSON.stringify(before.records));
  assert.equal((await f.repository.overview()).restoreSnapshotAt, null);
});

test('CSV export quotes text and neutralizes spreadsheet formulas', () => {
  const base = { occurredAt: '', timeZone: 'Asia/Manila', offsetMinutes: 480, revision: 1, walletId: '', categoryId: null, iconKey: null, colorToken: null, linkedId: null, feeMinor: null };
  const csv = transactionsCsv([
    { ...base, id: '1', type: 'expense', localDate: '2026-10-14', note: '=HYPERLINK("x")', amountMinor: -1205, walletName: 'Cash, main', categoryName: 'Food', counterpartyName: null },
    { ...base, id: '2', type: 'transfer', localDate: '2026-10-14', note: '', amountMinor: 5, walletName: '+Bank', categoryName: null, counterpartyName: 'Cash' },
  ]);
  assert.equal(csv, 'Date,Type,Wallet,Other wallet,Category,Amount (PHP),Note\r\n' +
    '2026-10-14,Expense,"Cash, main",,Food,-12.05,"\'=HYPERLINK(""x"")"\r\n' +
    '2026-10-14,Transfer,"\'+Bank",Cash,,0.05,\r\n');
});
