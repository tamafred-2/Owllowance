import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Database, type SqlConnection, type SqlValue } from '../src/data/sql';
import { SqlLedgerRepository } from '../src/data/ledger-repository';
import type { EntryCommand, OpeningCommand } from '../src/domain/ledger';

export class TestConnection implements SqlConnection {
  readonly sqlite: DatabaseSync;
  failNextEntry = false;
  failSchema = false;
  failUpgrade = false;
  failIncomeMigration = false;
  failAccountUpdate = false;
  failV4Migration = false;
  // Fails the Nth entry insert from now (1-based); 0 disables.
  failEntryAt = 0;
  constructor(filename = ':memory:') { this.sqlite = new DatabaseSync(filename); }
  async execAsync(sql: string) {
    if (this.failSchema && sql.includes('CREATE INDEX')) {
      // Execute part of the real migration, then fail to exercise DDL rollback.
      this.sqlite.exec(sql.split('CREATE INDEX')[0]);
      this.failSchema = false;
      throw new Error('Injected migration failure');
    }
    if (this.failUpgrade && sql.includes('ALTER TABLE accounts')) {
      this.sqlite.exec(sql.split(';')[0]);
      this.failUpgrade = false;
      throw new Error('Injected upgrade failure');
    }
    if (this.failIncomeMigration && sql.includes('CREATE TEMP TABLE saved_categories')) {
      this.sqlite.exec(sql);
      this.failIncomeMigration = false;
      throw new Error('Injected income migration failure');
    }
    if (this.failV4Migration && sql.includes('CREATE TEMP TABLE saved_transactions') && !sql.includes('saved_categories')) {
      this.sqlite.exec(sql);
      this.failV4Migration = false;
      throw new Error('Injected v4 migration failure');
    }
    this.sqlite.exec(sql);
  }
  async runAsync(sql: string, ...params: SqlValue[]) {
    if (this.failNextEntry && sql.includes('INSERT INTO entries')) {
      this.failNextEntry = false;
      throw new Error('Injected write failure');
    }
    if (this.failEntryAt && sql.includes('INSERT INTO entries') && --this.failEntryAt === 0) {
      throw new Error('Injected write failure');
    }
    if (this.failAccountUpdate && sql.startsWith('UPDATE accounts')) {
      this.failAccountUpdate = false;
      throw new Error('Injected account update failure');
    }
    return { changes: Number(this.sqlite.prepare(sql).run(...params).changes) };
  }
  async getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null> {
    return (this.sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]> {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }
}

export const time = {
  occurredAt: '2026-10-14T04:00:00.000Z', localDate: '2026-10-14', timeZone: 'Asia/Manila', offsetMinutes: 480,
};
export function opening(amountMinor = 100_000): OpeningCommand {
  return { id: randomUUID(), walletId: randomUUID(), walletName: 'Cash', amountMinor, ...time };
}
export async function fixture(filename?: string) {
  const connection = new TestConnection(filename);
  const repository = new SqlLedgerRepository(new Database(connection));
  await repository.initialize();
  const setup = opening();
  await repository.createWallet(setup);
  const overview = await repository.overview();
  function expense(amountMinor = 12_000): EntryCommand {
    return { id: randomUUID(), walletId: setup.walletId, categoryId: overview.categories[0].id, amountMinor, note: '', ...time };
  }
  return { connection, repository, setup, expense };
}
