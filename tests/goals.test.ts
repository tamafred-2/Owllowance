import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture, opening, time } from './sqlite-fixture';
import { monthlyNeeded } from '../src/domain/goals';

async function withGoal() {
  const f = await fixture();
  const gcash = { ...opening(0), walletName: 'GCash', walletKind: 'ewallet' as const };
  await f.repository.createWallet(gcash);
  const goal = { id: randomUUID(), name: 'New phone', description: 'For school', imageUri: null, targetMinor: 1_500_000, targetDate: '2027-03-31', iconKey: 'phone', colorToken: 'teal' };
  await f.repository.saveGoal(goal);
  const move = (amountMinor: number, walletId = f.setup.walletId, id = randomUUID()) =>
    f.repository.addContribution({ id, goalId: goal.id, walletId, amountMinor, note: '', ...time });
  const balances = async () => Object.fromEntries((await f.repository.overview()).wallets.map(wallet => [wallet.name, wallet.balanceMinor]));
  // Amounts saved before goals used wallets: a record only.
  const legacy = (amountMinor: number) => f.connection.sqlite.prepare("INSERT INTO goal_contributions (id, goal_id, amount_minor, local_date, note) VALUES (?, ?, ?, '2026-10-01', '')")
    .run(randomUUID(), goal.id, amountMinor);
  return { ...f, gcash, goal, move, balances, legacy };
}

test('adding to a goal moves money out of the chosen wallet and taking out returns it, keeping net worth', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  const id = randomUUID();
  await f.move(40_000, f.setup.walletId, id);
  await f.move(40_000, f.setup.walletId, id); // A retry of the same request is harmless.
  await f.move(-10_000, f.gcash.walletId);
  assert.deepEqual(await f.balances(), { Cash: 60_000, GCash: 10_000 });
  const view = await f.repository.overview();
  assert.deepEqual([view.goals[0].savedMinor, view.goals[0].hasWalletMoves], [30_000, true]);
  assert.deepEqual([view.totalBalanceMinor, view.spentMinor, view.incomeMinor], [100_000, 0, 0]);
  assert.equal(view.budgets.length, 0);
  await assert.rejects(f.move(-30_001, f.gcash.walletId), /more than is saved/);
  assert.throws(() => f.repository.addContribution({ id: randomUUID(), goalId: f.goal.id, walletId: f.setup.walletId, amountMinor: 0, note: '', ...time }), /not be zero/);

  // Both directions appear in the wallet history, named after the goal, and are managed from the goal.
  const activity = await f.repository.history(0, 10, { type: 'transfer' });
  assert.deepEqual(activity.map(row => [row.walletName, row.counterpartyName, row.amountMinor, row.goalId]).sort(),
    [['Cash', 'New phone', -40_000, f.goal.id], ['GCash', 'New phone', 10_000, f.goal.id]]);
  assert.equal((await f.repository.history(0, 10, { search: 'phone' })).length, 2);
  const deposit = activity.find(row => row.amountMinor < 0)!;
  await assert.rejects(f.repository.deleteTransaction(deposit.id, deposit.revision), /from the goal/);
  await assert.rejects(f.repository.updateTransfer({ id: deposit.id, toEntryId: randomUUID(), feeId: randomUUID(), fromWalletId: f.setup.walletId,
    toWalletId: f.gcash.walletId, amountMinor: 1, feeMinor: 0, note: '', revision: deposit.revision, ...time }), /from the goal/);

  const history = await f.repository.goalContributions(f.goal.id);
  assert.deepEqual(history.map(row => [row.amountMinor, row.walletName]).sort(), [[-10_000, 'GCash'], [40_000, 'Cash']]);
  await assert.rejects(f.repository.deleteContribution(history.find(row => row.amountMinor > 0)!.id), /negative/);
  await f.repository.deleteContribution(history.find(row => row.amountMinor < 0)!.id);
  assert.deepEqual(await f.balances(), { Cash: 60_000, GCash: 0 });
  assert.equal((await f.repository.overview()).goals[0].savedMinor, 40_000);
  assert.equal((await f.repository.history(0, 10, { type: 'transfer' })).length, 1);
});

test('archived goals take no new money but can be emptied; goals with wallet history cannot be deleted', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  await f.move(20_000);
  await f.repository.setGoalArchived(f.goal.id, true);
  await assert.rejects(f.move(1_000), /Restore this goal/);
  await assert.rejects(f.move(-1_000, randomUUID()), /available wallet/);
  await f.move(-20_000, f.gcash.walletId);
  await assert.rejects(f.repository.deleteGoal(f.goal.id), /Archive it instead/);
  assert.deepEqual(await f.balances(), { Cash: 80_000, GCash: 20_000 });
});

test('amounts saved before goals used wallets still count and their goals can be deleted', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  f.legacy(25_000);
  const view = await f.repository.overview();
  assert.deepEqual([view.goals[0].savedMinor, view.goals[0].hasWalletMoves, view.totalBalanceMinor], [25_000, false, 125_000]);
  assert.deepEqual((await f.repository.goalContributions(f.goal.id)).map(row => row.walletId), [null]);
  await f.repository.deleteGoal(f.goal.id);
  assert.equal((await f.repository.overview()).goals.length, 0);
  assert.equal(f.connection.sqlite.prepare('SELECT COUNT(*) AS n FROM goal_contributions').get()?.n, 0);
});

test('goals validate and keep their description and photo', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), targetMinor: 0 }), /greater than zero/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), name: ' ' }), /name/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), targetDate: '2026-02-30' }), /valid date/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), description: 'x'.repeat(501) }), /description/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), imageUri: 'https://example.com/a.jpg' }), /photo/);
  const imageUri = 'file:///data/user/0/app/files/goal-images/a.jpg';
  await f.repository.saveGoal({ ...f.goal, name: 'Phone', description: '  Latest model  ', imageUri, targetDate: null });
  const goal = (await f.repository.overview()).goals[0];
  assert.deepEqual([goal.name, goal.description, goal.imageUri, goal.targetDate], ['Phone', 'Latest model', imageUri, null]);
});

test('backups carry goals and their wallet movements; older backups still restore', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  await f.move(25_000);
  f.legacy(5_000);
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  assert.equal(backup.schemaVersion, 8);
  const target = await fixture(); t.after(() => target.connection.sqlite.close());
  await target.repository.restoreBackup(backup);
  const restored = await target.repository.overview();
  assert.deepEqual([restored.goals[0].savedMinor, restored.goals[0].description, restored.totalBalanceMinor], [30_000, 'For school', 105_000]);
  assert.equal(restored.wallets.find(wallet => wallet.name === 'Cash')?.balanceMinor, 75_000);

  const tampered = JSON.parse(JSON.stringify(backup));
  tampered.records.goal_contributions.find((row: { transaction_id: string | null }) => row.transaction_id).amount_minor = 99_000;
  await assert.rejects(async () => target.repository.restoreBackup(tampered), /goal movement is unbalanced/);

  // Version 6: goals without descriptions or photos, and record-only contributions.
  const v6 = JSON.parse(JSON.stringify(backup));
  v6.schemaVersion = 6;
  const linked = v6.records.goal_contributions.find((row: { transaction_id: string | null }) => row.transaction_id);
  v6.records.goal_contributions = v6.records.goal_contributions.filter((row: unknown) => row !== linked);
  v6.records.entries = v6.records.entries.filter((row: { transaction_id: string }) => row.transaction_id !== linked.transaction_id);
  v6.records.transactions = v6.records.transactions.filter((row: { id: string }) => row.id !== linked.transaction_id);
  for (const row of v6.records.goals) { delete row.description; delete row.image_uri; }
  for (const row of v6.records.goal_contributions) delete row.transaction_id;
  await target.repository.restoreBackup(v6);
  const fromV6 = (await target.repository.overview()).goals[0];
  assert.deepEqual([fromV6.savedMinor, fromV6.description, fromV6.imageUri], [5_000, '', null]);

  const older = JSON.parse(JSON.stringify(v6));
  older.schemaVersion = 5; delete older.records.goals; delete older.records.goal_contributions;
  await target.repository.restoreBackup(older);
  assert.equal((await target.repository.overview()).goals.length, 0);
});

test('upgrading from version 6 keeps goals and their saved amounts', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const goalId = randomUUID();
  f.connection.sqlite.exec(`DROP TABLE debt_entries; DROP TABLE debts; DROP TABLE goal_contributions; DROP TABLE goals;
    CREATE TABLE goals (id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, target_minor INTEGER NOT NULL,
      target_date TEXT, icon_key TEXT NOT NULL, color_token TEXT NOT NULL, archived_at TEXT);
    CREATE TABLE goal_contributions (id TEXT PRIMARY KEY NOT NULL, goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      amount_minor INTEGER NOT NULL, local_date TEXT NOT NULL, note TEXT NOT NULL);
    INSERT INTO goals SELECT '${goalId}', id, 'Trip', 500000, NULL, 'travel', 'teal', NULL FROM profiles;
    INSERT INTO goal_contributions VALUES ('${randomUUID()}', '${goalId}', 120000, '2026-09-01', '');
    DELETE FROM schema_migrations WHERE version >= 7; PRAGMA user_version = 6;`);
  await f.repository.initialize();
  assert.equal(f.connection.sqlite.prepare('PRAGMA user_version').get()?.user_version, 8);
  const goal = (await f.repository.overview()).goals[0];
  assert.deepEqual([goal.name, goal.savedMinor, goal.description, goal.imageUri, goal.hasWalletMoves], ['Trip', 120_000, '', null, false]);
});

test('monthly amount needed counts whole months to the target date', () => {
  assert.equal(monthlyNeeded(0, 1_200_000, '2027-10-27', '2026-10-27'), 92_308); // 13 months including this one.
  assert.equal(monthlyNeeded(0, 300_000, '2026-12-31', '2026-10-27'), 100_000);
  assert.equal(monthlyNeeded(300_000, 300_000, '2026-12-31', '2026-10-27'), null); // Already reached.
  assert.equal(monthlyNeeded(0, 300_000, null, '2026-10-27'), null);
});
