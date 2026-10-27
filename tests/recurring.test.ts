import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { RecurringCommand } from '../src/domain/ledger';
import { addDays, eventTime } from '../src/domain/date';
import { describeSchedule, dueDates } from '../src/domain/recurring';
import { validateBackup } from '../src/domain/backup';
import { reminderPlan } from '../src/domain/reminders';
import { fixture, time } from './sqlite-fixture';

test('schedules clamp month ends, follow weekdays and count day intervals from the start', () => {
  assert.deepEqual(dueDates({ frequency: 'monthly', every: 31, startDate: '2026-01-01' }, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(dueDates({ frequency: 'monthly', every: 29, startDate: '2028-02-01' }, '2028-02-01', '2028-02-29'), ['2028-02-29']);
  assert.deepEqual(dueDates({ frequency: 'weekly', every: 1, startDate: '2026-10-28' }, '2026-10-01', '2026-11-10'), ['2026-11-02', '2026-11-09']);
  assert.deepEqual(dueDates({ frequency: 'days', every: 3, startDate: '2026-10-01' }, '2026-10-05', '2026-10-12'), ['2026-10-07', '2026-10-10']);
  assert.deepEqual(dueDates({ frequency: 'monthly', every: 5, startDate: '2026-12-10' }, '2026-11-01', '2026-12-31'), []); // First due after the start.
  assert.equal(describeSchedule({ frequency: 'monthly', every: 22, startDate: '2026-01-01' }), 'Monthly on the 22nd');
  assert.throws(() => dueDates({ frequency: 'weekly', every: 8, startDate: '2026-01-01' }, '2026-01-01', '2026-01-31'), /repeat schedule/);
});

async function withRule(type: 'expense' | 'income' = 'expense') {
  const f = await fixture();
  const view = await f.repository.overview();
  const today = eventTime().localDate;
  const rule: RecurringCommand = {
    id: randomUUID(), name: 'Internet', type, amountMinor: 150_000, walletId: f.setup.walletId,
    categoryId: (type === 'expense' ? view.categories : view.incomeCategories)[0].id, frequency: 'days', every: 7, startDate: addDays(today, -7),
  };
  await f.repository.saveRecurring(rule);
  return { ...f, rule, today };
}

test('due list shows overdue and upcoming occurrences; paying posts once and marks it handled', async t => {
  const f = await withRule(); t.after(() => f.connection.sqlite.close());
  let due = (await f.repository.overview()).due;
  assert.deepEqual(due.map(item => [item.dueDate, item.overdue]), [[addDays(f.today, -7), true], [f.today, false], [addDays(f.today, 7), false]]);
  const pay = { id: randomUUID(), walletId: f.rule.walletId, categoryId: f.rule.categoryId, amountMinor: f.rule.amountMinor, note: 'Internet', ...eventTime(), recurringId: f.rule.id, dueDate: addDays(f.today, -7) };
  await f.repository.payRecurring(pay);
  await f.repository.payRecurring(pay); // A retry of the same payment is harmless.
  await assert.rejects(f.repository.payRecurring({ ...pay, id: randomUUID() }), /already handled/);
  const view = await f.repository.overview();
  assert.equal(view.totalBalanceMinor, 100_000 - 150_000);
  assert.equal(view.spentMinor, 150_000);
  due = view.due;
  assert.deepEqual(due.map(item => item.dueDate), [f.today, addDays(f.today, 7)]);
  await assert.rejects(f.repository.payRecurring({ ...pay, id: randomUUID(), dueDate: addDays(f.today, -3) }), /not on this schedule/);
  await f.repository.skipRecurring(f.rule.id, f.today);
  assert.deepEqual((await f.repository.overview()).due.map(item => item.dueDate), [addDays(f.today, 7)]);
  assert.equal((await f.repository.recurring())[0].nextDue, addDays(f.today, 7));
});

test('pausing hides due items; deleting a rule keeps its past payments', async t => {
  const f = await withRule('income'); t.after(() => f.connection.sqlite.close());
  await f.repository.payRecurring({ id: randomUUID(), walletId: f.rule.walletId, categoryId: f.rule.categoryId, amountMinor: f.rule.amountMinor, note: '', ...eventTime(), recurringId: f.rule.id, dueDate: f.today });
  await f.repository.setRecurringPaused(f.rule.id, true);
  assert.equal((await f.repository.overview()).due.length, 0);
  assert.equal((await f.repository.recurring())[0].paused, true);
  await f.repository.deleteRecurring(f.rule.id);
  const view = await f.repository.overview();
  assert.deepEqual([view.incomeMinor, (await f.repository.recurring()).length], [150_000, 0]);
  assert.equal(f.connection.sqlite.prepare('SELECT COUNT(*) AS n FROM recurring_occurrences').get()?.n, 0);
});

test('recurring rules validate wallet, category type and schedule', async t => {
  const f = await withRule(); t.after(() => f.connection.sqlite.close());
  const income = (await f.repository.overview()).incomeCategories[0].id;
  await assert.rejects(f.repository.saveRecurring({ ...f.rule, id: randomUUID(), categoryId: income }), /same type/);
  assert.throws(() => f.repository.saveRecurring({ ...f.rule, id: randomUUID(), every: 0 }), /repeat schedule/);
  assert.throws(() => f.repository.saveRecurring({ ...f.rule, id: randomUUID(), name: ' ' }), /name/);
  await f.repository.setWalletArchived(f.setup.walletId, true);
  await assert.rejects(f.repository.saveRecurring({ ...f.rule, id: randomUUID() }), /available wallet/);
});

test('backups carry recurring items; older version 4 backups still restore', async t => {
  const f = await withRule(); t.after(() => f.connection.sqlite.close());
  await f.repository.skipRecurring(f.rule.id, f.today);
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  assert.equal(backup.schemaVersion, 6);
  assert.equal(backup.records.recurring.length, 1);
  const target = await fixture(); t.after(() => target.connection.sqlite.close());
  await target.repository.restoreBackup(backup);
  assert.equal((await target.repository.recurring())[0].name, 'Internet');
  const older = JSON.parse(JSON.stringify(backup));
  older.schemaVersion = 4; delete older.records.recurring; delete older.records.recurring_occurrences; delete older.records.goals; delete older.records.goal_contributions;
  await target.repository.restoreBackup(older);
  assert.equal((await target.repository.recurring()).length, 0);
  const broken = JSON.parse(JSON.stringify(backup));
  broken.records.recurring_occurrences[0].recurring_id = randomUUID();
  assert.throws(() => validateBackup(broken), /missing item/);
  assert.ok(time);
});

test('reminders group one notification per day, fold overdue into today and never show amounts', () => {
  const base = { type: 'expense' as const, amountMinor: 99_900, walletId: 'w', walletName: 'Cash', categoryId: 'c', categoryName: 'Bills', iconKey: 'bills', colorToken: 'accent', overdue: false };
  const plan = reminderPlan([
    { ...base, recurringId: '1', name: 'Rent', dueDate: '2026-10-20', overdue: true },
    { ...base, recurringId: '2', name: 'Internet', dueDate: '2026-10-27' },
    { ...base, recurringId: '3', name: 'Water', dueDate: '2026-10-29' },
  ], '2026-10-27');
  assert.deepEqual(plan, [
    { localDate: '2026-10-27', title: 'Payments due', body: 'Rent and Internet are due today.' },
    { localDate: '2026-10-29', title: 'Payments due', body: 'Water is due.' },
  ]);
  assert.ok(plan.every(item => !/₱|999/.test(item.body)));
});

test('widget rows fit the widget height and the balance respects the hidden setting', async t => {
  const f = await withRule(); t.after(() => f.connection.sqlite.close());
  const { dueRows, balanceText } = await import('../src/widgets/widget-data');
  const view = await f.repository.overview();
  assert.deepEqual(dueRows(view, 110).rows.map(row => [row.name, row.when, row.overdue]), [['Internet', 'Overdue', true], ['Internet', 'Today', false]]);
  assert.equal(dueRows(view, 110).more, 1);
  assert.equal(dueRows(view, 40).rows.length, 1); // Always at least one row.
  assert.match(balanceText(view), /^₱/);
  await f.repository.setBalanceHidden('net-worth', true);
  assert.equal(balanceText(await f.repository.overview()), '₱ ••••');
});
