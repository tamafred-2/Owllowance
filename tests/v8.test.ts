import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture, opening, time } from './sqlite-fixture';
import { streakOf } from '../src/domain/streak';
import { eventTime } from '../src/domain/date';
import type { DebtDirection } from '../src/domain/ledger';

async function setup() {
  const f = await fixture();
  const gcash = { ...opening(0), walletName: 'GCash', walletKind: 'ewallet' as const };
  await f.repository.createWallet(gcash);
  const balances = async () => Object.fromEntries((await f.repository.overview()).wallets.map(wallet => [wallet.name, wallet.balanceMinor]));
  return { ...f, gcash, balances };
}

test('starting balance can be corrected without counting as income', async t => {
  const f = await setup(); t.after(() => f.connection.sqlite.close());
  await f.repository.addExpense(f.expense(10_000));
  await f.repository.setStartingBalance(f.setup.walletId, 250_000);
  const view = await f.repository.overview();
  assert.deepEqual(await f.balances(), { Cash: 240_000, GCash: 0 });
  assert.deepEqual([view.wallets[0].openingMinor, view.incomeMinor, view.totalBalanceMinor], [250_000, 0, 240_000]);
  assert.throws(() => f.repository.setStartingBalance(f.setup.walletId, -1), /negative/);
  await assert.rejects(f.repository.setStartingBalance(randomUUID(), 1), /not found/);
  await f.repository.setWalletArchived(f.gcash.walletId, true);
  await assert.rejects(f.repository.setStartingBalance(f.gcash.walletId, 5_000), /Restore this wallet/);
});

test('"I bought it" returns goal money to the wallet and records the purchase as spending', async t => {
  const f = await setup(); t.after(() => f.connection.sqlite.close());
  const goal = { id: randomUUID(), name: 'Phone', description: '', imageUri: null, targetMinor: 50_000, targetDate: null, iconKey: 'phone', colorToken: 'teal' };
  await f.repository.saveGoal(goal);
  await f.repository.addContribution({ id: randomUUID(), goalId: goal.id, walletId: f.setup.walletId, amountMinor: 50_000, note: '', ...time });
  const category = (await f.repository.overview()).categories[0].id;
  const command = { goalId: goal.id, moveId: randomUUID(), expenseId: randomUUID(), walletId: f.gcash.walletId, categoryId: category, amountMinor: 45_000, note: 'Phone', ...time };
  await f.repository.completeGoal(command);
  await f.repository.completeGoal(command); // A retry is harmless.
  const view = await f.repository.overview();
  assert.deepEqual(await f.balances(), { Cash: 50_000, GCash: 5_000 }); // The ₱50 left over stays in GCash.
  assert.deepEqual([view.goals[0].savedMinor, Boolean(view.goals[0].completedAt), Boolean(view.goals[0].archivedAt)], [0, true, true]);
  assert.deepEqual([view.spentMinor, view.totalBalanceMinor], [45_000, 55_000]);
  await assert.rejects(f.repository.completeGoal({ ...command, moveId: randomUUID(), expenseId: randomUUID() }), /already completed/);
  await f.repository.setGoalArchived(goal.id, false); // Reopening clears completion.
  assert.equal((await f.repository.overview()).goals[0].completedAt, null);
});

test('debts move wallet money in the right direction and never change net worth', async t => {
  const f = await setup(); t.after(() => f.connection.sqlite.close());
  const create = (direction: DebtDirection, amountMinor: number, walletId: string | null) => {
    const id = randomUUID();
    const command = { id, name: direction === 'owe' ? 'Ana' : 'Ben', direction, dueDate: '2026-12-01', note: '',
      initial: { id: randomUUID(), debtId: id, amountMinor, walletId, note: '', ...time } };
    return { id, command, done: f.repository.saveDebt(command) };
  };
  const borrowed = create('owe', 30_000, f.setup.walletId); await borrowed.done;
  await f.repository.saveDebt(borrowed.command); // A retried create is harmless.
  const lent = create('owed', 20_000, f.gcash.walletId); await lent.done; // Lending leaves GCash.
  const lentRecord = create('owed', 20_000, null); await lentRecord.done; // Record only: no wallet.
  assert.deepEqual(await f.balances(), { Cash: 130_000, GCash: -20_000 });
  let view = await f.repository.overview();
  assert.deepEqual([view.oweMinor, view.owedMinor, view.totalBalanceMinor, view.incomeMinor, view.spentMinor], [30_000, 40_000, 110_000, 0, 0]);

  const pay = (debtId: string, amountMinor: number, walletId: string | null) =>
    f.repository.addDebtEntry({ id: randomUUID(), debtId, amountMinor, walletId, note: '', ...time });
  await pay(borrowed.id, -10_000, f.setup.walletId); // Paying back leaves Cash.
  await pay(lent.id, -5_000, f.setup.walletId); // Being repaid arrives in Cash.
  await assert.rejects(pay(borrowed.id, -20_001, f.setup.walletId), /more than what is left/);
  assert.deepEqual(await f.balances(), { Cash: 125_000, GCash: -20_000 });
  view = await f.repository.overview();
  assert.deepEqual([view.oweMinor, view.owedMinor], [20_000, 35_000]);

  const activity = await f.repository.history(0, 20, { type: 'transfer' });
  assert.deepEqual(activity.map(row => [row.counterpartyName, row.debtDirection, row.amountMinor]).sort(),
    [['Ana', 'owe', -10_000], ['Ana', 'owe', 30_000], ['Ben', 'owed', -20_000], ['Ben', 'owed', 5_000]]);
  const payment = activity.find(row => row.amountMinor === -10_000)!;
  await assert.rejects(f.repository.deleteTransaction(payment.id, payment.revision), /from the debt/);

  const entries = await f.repository.debtEntries(borrowed.id);
  assert.deepEqual(entries.map(row => [row.amountMinor, row.walletName]).sort(), [[-10_000, 'Cash'], [30_000, 'Cash']]);
  await assert.rejects(f.repository.deleteDebtEntry(entries.find(row => row.amountMinor > 0)!.id), /negative/);
  await f.repository.deleteDebtEntry(entries.find(row => row.amountMinor < 0)!.id); // The payment returns to Cash.
  assert.equal((await f.balances()).Cash, 135_000);

  await assert.rejects(f.repository.deleteDebt(borrowed.id), /Archive it instead/);
  await assert.rejects(f.repository.saveDebt({ ...borrowed.command, direction: 'owed', initial: undefined }), /switch/);
  await f.repository.deleteDebt(lentRecord.id); // Record only, so it can go.
  await f.repository.setDebtArchived(borrowed.id, true);
  assert.deepEqual((await f.repository.overview()).debts.map(debt => [debt.name, Boolean(debt.archivedAt)]), [['Ben', false], ['Ana', true]]);
});

test('backups carry debts and completed goals; tampered debt movements and older files are handled', async t => {
  const f = await setup(); t.after(() => f.connection.sqlite.close());
  const id = randomUUID();
  await f.repository.saveDebt({ id, name: 'Ana', direction: 'owe', dueDate: null, note: 'Lunch money', initial: { id: randomUUID(), debtId: id, amountMinor: 15_000, walletId: f.setup.walletId, note: '', ...time } });
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  assert.equal(backup.schemaVersion, 8);
  const target = await fixture(); t.after(() => target.connection.sqlite.close());
  await target.repository.restoreBackup(backup);
  const restored = await target.repository.overview();
  assert.deepEqual([restored.oweMinor, restored.debts[0].note, restored.wallets[0].balanceMinor], [15_000, 'Lunch money', 115_000]);
  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.records.debt_entries[0].amount_minor = 99_000;
  await assert.rejects(async () => target.repository.restoreBackup(tampered), /unbalanced/);
  const v7 = JSON.parse(JSON.stringify(backup));
  v7.schemaVersion = 7; delete v7.records.debts; delete v7.records.debt_entries;
  const move = backup.records.debt_entries[0].transaction_id;
  v7.records.transactions = v7.records.transactions.filter((row: { id: string }) => row.id !== move);
  v7.records.entries = v7.records.entries.filter((row: { transaction_id: string }) => row.transaction_id !== move);
  await target.repository.restoreBackup(v7);
  assert.equal((await target.repository.overview()).debts.length, 0);
});

test('streak counts consecutive recorded days and keeps yesterday alive until today ends', () => {
  assert.deepEqual(streakOf(['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-20'], '2026-10-27'), { current: 3, best: 3, loggedToday: true });
  assert.deepEqual(streakOf(['2026-10-26', '2026-10-25'], '2026-10-27'), { current: 2, best: 2, loggedToday: false });
  assert.deepEqual(streakOf(['2026-10-24', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], '2026-10-27'), { current: 0, best: 4, loggedToday: false });
  assert.deepEqual(streakOf([], '2026-10-27'), { current: 0, best: 0, loggedToday: false });
});

test('overview streak ignores opening balances', async t => {
  const f = await setup(); t.after(() => f.connection.sqlite.close());
  assert.equal((await f.repository.overview()).streak.current, 0);
  await f.repository.addExpense({ ...f.expense(500), ...eventTime() });
  assert.deepEqual((await f.repository.overview()).streak, { current: 1, best: 1, loggedToday: true });
});
