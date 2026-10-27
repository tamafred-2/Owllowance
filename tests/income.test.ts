import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fixture, opening, TestConnection, time } from './sqlite-fixture';
import { Database } from '../src/data/sql';
import { SqlLedgerRepository } from '../src/data/ledger-repository';
import { MAX_MINOR } from '../src/domain/money';
import { eventTime } from '../src/domain/date';

test('daily overview excludes historical income and opening balances across wallets', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const categoryId = (await f.repository.overview()).incomeCategories[0].id;
  const today = eventTime();
  await f.repository.addIncome({ ...f.expense(10000), ...today, categoryId });
  await f.repository.addIncome({ ...f.expense(90000), occurredAt: '2000-01-01T00:00:00.000Z', localDate: '2000-01-01', timeZone: 'UTC', offsetMinutes: 0, categoryId });
  const bank = { ...opening(50000), walletName: 'Bank', walletKind: 'bank' as const };
  await f.repository.createWallet(bank);
  await f.repository.addIncome({ ...f.expense(2000), ...today, walletId: bank.walletId, categoryId });
  await f.repository.addExpense({ ...f.expense(3000), ...today });
  const view = await f.repository.overview();
  assert.equal(view.todayIncomeMinor, 12000);
  assert.equal(view.todaySpentMinor, 3000);
  assert.equal(view.incomeMinor, 102000);
});

test('income credits the selected wallet once, stays out of spending, and rejects wrong categories', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const bank = { ...opening(0), walletName: 'Bank', walletKind: 'bank' as const };
  await f.repository.createWallet(bank);
  const before = await f.repository.overview();
  assert.equal(before.incomeMinor, 0);
  assert.equal(before.incomeCategories.length, 5);
  const command = { ...f.expense(12345), walletId: bank.walletId, categoryId: before.incomeCategories[0].id, note: 'Weekly allowance' };
  f.connection.failNextEntry = true;
  await assert.rejects(f.repository.addIncome(command), /Injected/);
  assert.equal((await f.repository.overview()).incomeCount, 0);
  await Promise.all([f.repository.addIncome(command), f.repository.addIncome(command)]);
  const after = await f.repository.overview();
  assert.equal(after.wallets.find(w => w.id === bank.walletId)?.balanceMinor, 12345);
  assert.equal(after.wallets.find(w => w.id === f.setup.walletId)?.balanceMinor, 100000);
  assert.equal(after.totalBalanceMinor, 112345);
  assert.equal(after.incomeMinor, 12345);
  assert.equal(after.incomeCount, 1);
  assert.equal(after.spentMinor, 0);
  assert.equal(after.todaySpentMinor, 0);
  const item = (await f.repository.history(0, 10)).find(item => item.id === command.id)!;
  assert.equal(item.type, 'income'); assert.equal(item.amountMinor, 12345); assert.equal(item.categoryName, 'Allowance');
  await assert.rejects(f.repository.addIncome({ ...command, amountMinor: 22 }), /different transaction/);
  await assert.rejects(f.repository.addExpense(command), /different transaction/);
  await assert.rejects(f.repository.addIncome(f.expense()), /available category/);
  await assert.rejects(f.repository.addExpense({ ...command, id: randomUUID() }), /available category/);
  await f.repository.setWalletArchived(bank.walletId, true);
  await f.repository.addIncome(command);
  await assert.rejects(f.repository.addIncome({ ...command, id: randomUUID() }), /available wallet/);
  await f.repository.setWalletArchived(bank.walletId, false);
  f.connection.sqlite.prepare('UPDATE categories SET archived_at = ? WHERE id = ?').run(time.occurredAt, command.categoryId);
  await assert.rejects(f.repository.addIncome({ ...command, id: randomUUID() }), /available category/);
});

test('income validates positive amounts, bounds and atomic overflow', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const categoryId = (await f.repository.overview()).incomeCategories[0].id;
  const income = (amountMinor: number) => ({ ...f.expense(amountMinor), categoryId });
  assert.throws(() => f.repository.addIncome(income(0)), /greater than zero/);
  assert.throws(() => f.repository.addIncome(income(-1)), /greater than zero/);
  assert.throws(() => f.repository.addIncome(income(1.5)));
  await assert.rejects(f.repository.addIncome(income(MAX_MINOR)));
  assert.equal((await f.repository.overview()).incomeCount, 0);
  await f.repository.addIncome(income(MAX_MINOR - 100000));
  await f.repository.addExpense(f.expense(100001));
  await assert.rejects(f.repository.addIncome(income(100001))); // Cumulative income bound, despite wallet room.
  assert.equal((await f.repository.overview()).incomeMinor, MAX_MINOR - 100000);
});

test('real v2 upgrade rolls back dropped tables on failure and preserves history on retry', async t => {
  const connection = new TestConnection(); t.after(() => connection.sqlite.close());
  connection.sqlite.exec(readFileSync(new URL('./fixtures/schema-v2.sql', import.meta.url), 'utf8'));
  const profile = '00000000-0000-4000-8000-000000000001';
  const setup = opening();
  connection.sqlite.prepare('INSERT INTO profiles VALUES (?, ?, ?)').run(profile, 'PHP', time.timeZone);
  connection.sqlite.prepare('INSERT INTO accounts (id,profile_id,name,kind,opening_name) VALUES (?,?,?,?,?)').run(setup.walletId, profile, 'Renamed cash', 'cash', 'Cash');
  connection.sqlite.prepare('INSERT INTO transactions (id,profile_id,type,occurred_at,local_date,time_zone,offset_minutes,note,category_id) VALUES (?,?,?,?,?,?,?,?,?)').run(setup.id,profile,'opening',time.occurredAt,time.localDate,time.timeZone,time.offsetMinutes,'',null);
  connection.sqlite.prepare('INSERT INTO entries VALUES (?,?,?,?,?)').run(setup.id,setup.id,profile,setup.walletId,100000);
  const categoryId = randomUUID(), expenseId = randomUUID();
  connection.sqlite.prepare("INSERT INTO categories (id,profile_id,type,name,icon_key,color_token) VALUES (?,?,'expense','Food','food','accent')").run(categoryId, profile);
  connection.sqlite.prepare('INSERT INTO transactions (id,profile_id,type,occurred_at,local_date,time_zone,offset_minutes,note,category_id) VALUES (?,?,?,?,?,?,?,?,?)').run(expenseId,profile,'expense',time.occurredAt,time.localDate,time.timeZone,time.offsetMinutes,'Existing meal',categoryId);
  connection.sqlite.prepare('INSERT INTO entries VALUES (?,?,?,?,?)').run(expenseId,expenseId,profile,setup.walletId,-1250);
  const oldHistory = await repositoryHistory();
  async function repositoryHistory() { return connection.sqlite.prepare('SELECT id, profile_id, type, occurred_at, local_date, time_zone, offset_minutes, note, category_id, revision FROM transactions ORDER BY id').all(); }
  const repository = new SqlLedgerRepository(new Database(connection));
  connection.failIncomeMigration = true;
  await assert.rejects(repository.initialize(), /Injected income migration/);
  assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 2);
  assert.equal(connection.sqlite.prepare('SELECT SUM(amount_minor) AS amount FROM entries').get()?.amount, 98750);
  assert.deepEqual(await repositoryHistory(), oldHistory);
  await repository.initialize(); await repository.initialize();
  await repository.createWallet(setup); // Original creation remains idempotent after migration and rename.
  const view = await repository.overview();
  assert.equal(view.totalBalanceMinor, 98750); assert.equal(view.incomeMinor, 0);
  assert.equal(view.spentMinor, 1250); assert.equal(view.expenseCount, 1);
  assert.deepEqual(await repositoryHistory(), oldHistory);
  assert.equal(view.wallet?.name, 'Renamed cash'); assert.equal(view.incomeCategories.length, 5);
  assert.equal((await repository.history(0,10)).filter(item => item.type === 'opening').length, 1);
  assert.deepEqual(connection.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(connection.sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.equal(connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 4);
});
