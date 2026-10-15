import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMinor, assertMinor, formatMoney, MAX_MINOR, parseAmount } from '../src/domain/money';
import { assertEventTime, eventTime } from '../src/domain/date';
import { TrackerService } from '../src/features/tracker/application/tracker-service';
import { randomUUID } from 'node:crypto';
import { time, fixture } from './sqlite-fixture';

test('decimal input parses exactly into integer centavos', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount(' 0012.3 '), 1230);
  assert.equal(parseAmount('0', true), 0);
  assert.equal(parseAmount('90000000000.00'), MAX_MINOR);
  assert.equal(parseAmount('999999.99'), 99_999_999);
});

test('invalid, zero, non-finite and out-of-range inputs are rejected', () => {
  for (const value of ['', '-1', '+1', '0', '0.001', '1e3', 'NaN', 'Infinity', '1,000', '1.2.3', '90000000000.01']) {
    assert.throws(() => parseAmount(value), value);
  }
  for (const value of [NaN, Infinity, 0.1, MAX_MINOR + 1]) assert.throws(() => assertMinor(value));
  assert.throws(() => addMinor(MAX_MINOR, 1));
  assert.throws(() => addMinor(-MAX_MINOR, -1));
  assert.match(formatMoney(-29), /-.*0\.29/);
});

test('calendar context preserves valid leap dates and rejects impossible dates', () => {
  assertEventTime({ ...time, localDate: '2028-02-29' });
  assertEventTime({ ...time, localDate: '2026-12-31', timeZone: 'America/New_York', offsetMinutes: -300 });
  for (const localDate of ['2026-02-29', '2026-04-31', '2026-13-01', 'invalid']) {
    assert.throws(() => assertEventTime({ ...time, localDate }));
  }
  assert.throws(() => assertEventTime({ ...time, timeZone: 'No/Such_Zone' }));
  assert.throws(() => eventTime(new Date('invalid')));
});

test('entry service validates and prepares a draft without writing finances', async t => {
  const f = await fixture(); t.after(() => f.connection.sqlite.close());
  const service = new TrackerService(f.repository, randomUUID);
  const draft = service.prepareEntry({ walletId: f.setup.walletId, categoryId: (await f.repository.overview()).categories[0].id, amount: '0.29', note: '  Lunch  ' });
  assert.equal(draft.amountMinor, 29);
  assert.equal(draft.note, 'Lunch');
  assert.equal((await f.repository.overview()).expenseCount, 0);
  assert.throws(() => service.prepareEntry({ walletId: f.setup.walletId, categoryId: '', amount: '1', note: '' }));
  assert.equal(service.prepareWallet('Cash', '0').amountMinor, 0);
});
