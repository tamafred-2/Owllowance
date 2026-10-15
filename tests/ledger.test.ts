import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import { Database } from '../src/data/sql';
import { SqlLedgerRepository } from '../src/data/ledger-repository';
import { MAX_MINOR } from '../src/domain/money';
import { eventTime } from '../src/domain/date';
import { fixture, opening, TestConnection } from './sqlite-fixture';

test('rename and archive preserve totals/history, creation retries, and expense protections', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const posted = f.expense(200);
  await f.repository.addExpense(posted);
  await f.repository.renameWallet(f.setup.walletId, '  Everyday  ');
  await f.repository.createWallet(f.setup);
  assert.equal((await f.repository.history(0, 10))[0].walletName, 'Everyday');
  await f.repository.setWalletArchived(f.setup.walletId, true);
  await f.repository.setWalletArchived(f.setup.walletId, true);
  const archived = await f.repository.overview();
  assert.equal(archived.wallet, null);
  assert.equal(archived.wallets.length, 0);
  assert.equal(archived.archivedWallets[0].name, 'Everyday');
  assert.equal(archived.totalBalanceMinor, 99_800);
  assert.equal(archived.spentMinor, 200);
  assert.equal(archived.recent.length, 2);
  await assert.rejects(f.repository.addExpense(f.expense(100)), /available wallet/);
  await f.repository.addExpense(posted); // Retrying an already committed expense is safe.
  await f.repository.setWalletArchived(f.setup.walletId, false);
  await f.repository.addExpense(f.expense(100));
  assert.equal((await f.repository.overview()).totalBalanceMinor, 99_700);
  assert.throws(() => f.repository.renameWallet(f.setup.walletId, ' '), /wallet name/);
  await assert.rejects(f.repository.renameWallet(randomUUID(), 'Missing'), /not found/);
  f.connection.failAccountUpdate = true;
  await assert.rejects(f.repository.setWalletArchived(f.setup.walletId, true), /Injected/);
  assert.equal((await f.repository.overview()).wallets.length, 1);
});

test('v1 upgrade preserves existing records and rolls back interrupted metadata migration', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  await f.repository.addExpense(f.expense(123));
  // Reconstruct the exact prior accounts schema; financial rows stay untouched.
  f.connection.sqlite.exec('ALTER TABLE accounts DROP COLUMN opening_name; DELETE FROM schema_migrations WHERE version >= 2; PRAGMA user_version = 1;');
  f.connection.failUpgrade = true;
  await assert.rejects(f.repository.initialize(), /Injected upgrade/);
  assert.equal(f.connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
  assert.equal(f.connection.sqlite.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('accounts') WHERE name = 'opening_name'").get()?.n, 0);
  await f.repository.initialize();
  assert.equal((await f.repository.overview()).totalBalanceMinor, 99_877);
  await f.repository.renameWallet(f.setup.walletId, 'Renamed');
  await f.repository.createWallet(f.setup);
  assert.equal((await f.repository.overview()).wallets.length, 1);
  assert.equal(f.connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 3);
});

test('multiple wallet types preserve existing records and debit only the selected account', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const bank = { ...opening(200_000), walletName: 'Bank', walletKind: 'bank' as const };
  const digital = { ...opening(50_000), walletName: 'Digital', walletKind: 'ewallet' as const };
  await f.repository.createWallet(bank);
  await f.repository.createWallet(digital);
  await f.repository.createWallet(bank);
  const spend = { ...f.expense(1234), walletId: bank.walletId, ...eventTime() };
  await f.repository.addExpense(spend);
  await f.repository.addExpense(spend);
  await f.repository.initialize();
  const view = await f.repository.overview();
  assert.deepEqual(view.wallets.map(w => [w.kind, w.balanceMinor]), [['cash', 100_000], ['bank', 198_766], ['ewallet', 50_000]]);
  assert.equal(view.totalBalanceMinor, 348_766);
  assert.equal(view.spentMinor, 1234);
  assert.equal(view.todaySpentMinor, 1234);
  assert.equal(view.categories.length, 6);
  assert.equal(view.recent.find(item => item.id === spend.id)?.walletName, 'Bank');
  await assert.rejects(f.repository.createWallet({ ...bank, walletKind: 'cash' }), /different transaction/);
});

test('additional wallet failure rolls back without harming existing records; aggregate overflow is rejected', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const second = { ...opening(200), walletKind: 'bank' as const };
  f.connection.failNextEntry = true;
  await assert.rejects(f.repository.createWallet(second), /Injected/);
  assert.equal((await f.repository.overview()).wallets.length, 1);
  assert.equal((await f.repository.overview()).totalBalanceMinor, 100_000);
  await f.repository.createWallet(second);
  await assert.rejects(f.repository.createWallet(opening(MAX_MINOR)), /supported range/);
  assert.equal((await f.repository.overview()).totalBalanceMinor, 100_200);
  assert.equal((await f.repository.overview()).wallets.length, 2);
});

test('opening balance is distinct from spending; fractional expenses reduce balance exactly', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  assert.equal((await f.repository.overview()).spentMinor, 0);
  await f.repository.addExpense(f.expense(29));
  await f.repository.addExpense(f.expense(1));
  const overview = await f.repository.overview();
  assert.equal(overview.wallet?.balanceMinor, 99_970);
  assert.equal(overview.spentMinor, 30);
  assert.equal(overview.expenseCount, 2);
  assert.deepEqual(overview.recent.map(row => row.type).sort(), ['expense', 'expense', 'opening']);
});

test('entry write failure rolls back transaction and retry posts exactly once', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const draft = f.expense();
  f.connection.failNextEntry = true;
  await assert.rejects(f.repository.addExpense(draft), /Injected/);
  assert.equal((await f.repository.overview()).wallet?.balanceMinor, 100_000);
  assert.equal(f.connection.sqlite.prepare('SELECT COUNT(*) AS count FROM transactions').get()?.count, 1);
  await f.repository.addExpense(draft);
  await f.repository.addExpense(draft);
  assert.equal((await f.repository.overview()).expenseCount, 1);
  assert.equal((await f.repository.overview()).wallet?.balanceMinor, 88_000);
});

test('concurrent saves serialize; duplicate request IDs cannot change their payload', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const draft = f.expense(200);
  await Promise.all([f.repository.addExpense(draft), f.repository.addExpense(draft), f.repository.addExpense(f.expense(300))]);
  assert.equal((await f.repository.overview()).spentMinor, 500);
  assert.equal((await f.repository.overview()).expenseCount, 2);
  await assert.rejects(f.repository.addExpense({ ...draft, amountMinor: 201 }), /different transaction/);
  assert.equal((await f.repository.overview()).spentMinor, 500);
});

test('wallet setup failure is fully atomic and safe to retry', async t => {
  const connection = new TestConnection(); t.after(() => connection.sqlite.close());
  const repository = new SqlLedgerRepository(new Database(connection));
  await repository.initialize();
  const setup = opening(0);
  connection.failNextEntry = true;
  await assert.rejects(repository.createWallet(setup));
  assert.equal((await repository.overview()).wallet, null);
  assert.equal((await repository.overview()).categories.length, 0);
  await repository.createWallet(setup);
  await repository.createWallet(setup);
  await assert.rejects(repository.createWallet({ ...setup, walletName: 'Different wallet' }), /different transaction/);
  assert.equal((await repository.overview()).wallet?.balanceMinor, 0);
  await repository.createWallet(opening());
  assert.equal((await repository.overview()).wallets.length, 2);
});

test('bad references, archived categories and invalid amounts leave balances unchanged', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  await assert.rejects(f.repository.addExpense({ ...f.expense(), walletId: randomUUID() }));
  await assert.rejects(f.repository.addExpense({ ...f.expense(), categoryId: randomUUID() }));
  for (const value of [0, -1, 0.29, Infinity]) {
    await assert.rejects(async () => f.repository.addExpense(f.expense(value)));
  }
  const draft = f.expense();
  f.connection.sqlite.prepare("UPDATE categories SET archived_at = '2026-10-14' WHERE id = ?").run(draft.categoryId);
  await assert.rejects(f.repository.addExpense(draft), /available category/);
  assert.equal((await f.repository.overview()).wallet?.balanceMinor, 100_000);
  assert.equal((await f.repository.overview()).expenseCount, 0);
  assert.throws(() => f.connection.sqlite.prepare('UPDATE entries SET account_id = ?').run(randomUUID()), /FOREIGN KEY/);
});

test('negative balances are recorded; aggregate bounds reject unsafe totals atomically', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  await f.repository.addExpense(f.expense(MAX_MINOR));
  assert.equal((await f.repository.overview()).wallet?.balanceMinor, 100_000 - MAX_MINOR);
  await assert.rejects(f.repository.addExpense(f.expense(1)), /supported range/);
  assert.equal((await f.repository.overview()).spentMinor, MAX_MINOR);
});

test('migration failure rolls back DDL; retry and reinitialization preserve existing balances', async t => {
  const connection = new TestConnection(); t.after(() => connection.sqlite.close());
  const repository = new SqlLedgerRepository(new Database(connection));
  connection.failSchema = true;
  await assert.rejects(repository.initialize(), /migration failure/);
  assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 0);
  assert.equal(connection.sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get()?.count, 0);
  await repository.initialize(); await repository.createWallet(opening()); await repository.initialize();
  assert.equal((await repository.overview()).wallet?.balanceMinor, 100_000);
  assert.equal(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()?.count, 3);
});

test('newer schema is refused without resetting it', async t => {
  const connection = new TestConnection(); t.after(() => connection.sqlite.close());
  connection.sqlite.exec('PRAGMA user_version = 4');
  await assert.rejects(new SqlLedgerRepository(new Database(connection)).initialize(), /newer version/);
  assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 4);
});

test('reopening the database preserves balances, notes and stored historical dates', async () => {
  const filename = join(tmpdir(), `owllowance-test-${randomUUID()}.db`);
  let connection: TestConnection | undefined;
  try {
    const f = await fixture(filename); connection = f.connection;
    const draft = { ...f.expense(1230), localDate: '2028-02-29', note: "Lunch'); DROP TABLE accounts; --" };
    await f.repository.addExpense(draft);
    connection.sqlite.close(); connection = new TestConnection(filename);
    const reopened = new SqlLedgerRepository(new Database(connection));
    await reopened.initialize();
    const overview = await reopened.overview();
    assert.equal(overview.wallet?.balanceMinor, 98_770);
    assert.equal(overview.recent[0].localDate, '2028-02-29');
    assert.equal(overview.recent[0].note, draft.note);
  } finally {
    connection?.sqlite.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(filename + suffix, { force: true });
  }
});

test('history pages contain each record once in a deterministic order', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  for (let index = 0; index < 51; index++) await f.repository.addExpense(f.expense(1));
  const first = await f.repository.history(0, 25);
  const second = await f.repository.history(25, 25);
  const third = await f.repository.history(50, 25);
  assert.equal(new Set([...first, ...second, ...third].map(item => item.id)).size, 52);
  assert.equal(third.length, 2);
  await assert.rejects(f.repository.history(-1, 25));
});
