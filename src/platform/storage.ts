import { openDatabaseAsync } from 'expo-sqlite';
import { Database } from '../data/sql';

export async function openStorage(): Promise<Database> {
  return new Database(await openDatabaseAsync('owllowance.db'));
}

export async function prepareOffline(): Promise<void> {}
