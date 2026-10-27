import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixture } from './sqlite-fixture';
import { monthlyNeeded } from '../src/domain/goals';

async function withGoal() {
  const f = await fixture();
  const goal = { id: randomUUID(), name: 'New phone', targetMinor: 1_500_000, targetDate: '2027-03-31', iconKey: 'phone', colorToken: 'teal' };
  await f.repository.saveGoal(goal);
  const contribute = (amountMinor: number, id = randomUUID()) => f.repository.addContribution({ id, goalId: goal.id, amountMinor, localDate: '2026-10-27', note: '' });
  return { ...f, goal, contribute };
}

test('goal contributions track money set aside without changing balances or spending', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  const id = randomUUID();
  await f.contribute(500_000, id);
  await f.contribute(500_000, id); // A retry of the same contribution is harmless.
  await f.contribute(-100_000);
  const view = await f.repository.overview();
  assert.deepEqual(view.goals.map(goal => [goal.name, goal.savedMinor, goal.targetMinor]), [['New phone', 400_000, 1_500_000]]);
  assert.deepEqual([view.totalBalanceMinor, view.spentMinor, view.incomeMinor], [100_000, 0, 0]);
  await assert.rejects(f.contribute(-500_000), /more than is saved/);
  const history = await f.repository.goalContributions(f.goal.id);
  assert.deepEqual(history.map(row => row.amountMinor).sort((a, b) => a - b), [-100_000, 500_000]);
  await assert.rejects(f.repository.deleteContribution(history.find(row => row.amountMinor > 0)!.id), /negative/);
  await f.repository.deleteContribution(history.find(row => row.amountMinor < 0)!.id);
  assert.equal((await f.repository.overview()).goals[0].savedMinor, 500_000);
});

test('goals validate, archive, edit and delete with their contributions', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), targetMinor: 0 }), /greater than zero/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), name: ' ' }), /name/);
  assert.throws(() => f.repository.saveGoal({ ...f.goal, id: randomUUID(), targetDate: '2026-02-30' }), /valid date/);
  await f.repository.saveGoal({ ...f.goal, name: 'Phone', targetDate: null });
  await f.contribute(10_000);
  await f.repository.setGoalArchived(f.goal.id, true);
  assert.ok((await f.repository.overview()).goals[0].archivedAt);
  await f.repository.deleteGoal(f.goal.id);
  assert.equal((await f.repository.overview()).goals.length, 0);
  assert.equal(f.connection.sqlite.prepare('SELECT COUNT(*) AS n FROM goal_contributions').get()?.n, 0);
});

test('backups carry goals; version 5 backups restore without them', async t => {
  const f = await withGoal(); t.after(() => f.connection.sqlite.close());
  await f.contribute(250_000);
  const backup = JSON.parse(JSON.stringify(await f.repository.exportBackup('test')));
  assert.equal(backup.records.goals.length, 1);
  const target = await fixture(); t.after(() => target.connection.sqlite.close());
  await target.repository.restoreBackup(backup);
  assert.equal((await target.repository.overview()).goals[0].savedMinor, 250_000);
  const older = JSON.parse(JSON.stringify(backup));
  older.schemaVersion = 5; delete older.records.goals; delete older.records.goal_contributions;
  await target.repository.restoreBackup(older);
  assert.equal((await target.repository.overview()).goals.length, 0);
});

test('monthly amount needed counts whole months to the target date', () => {
  assert.equal(monthlyNeeded(0, 1_200_000, '2027-10-27', '2026-10-27'), 92_308); // 13 months including this one.
  assert.equal(monthlyNeeded(0, 300_000, '2026-12-31', '2026-10-27'), 100_000);
  assert.equal(monthlyNeeded(300_000, 300_000, '2026-12-31', '2026-10-27'), null); // Already reached.
  assert.equal(monthlyNeeded(0, 300_000, null, '2026-10-27'), null);
});
