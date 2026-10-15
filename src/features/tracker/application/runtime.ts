import { randomUUID } from 'expo-crypto';
import { SqlLedgerRepository } from '../../../data/ledger-repository';
import { openStorage } from '../../../platform/storage';
import { TrackerService } from './tracker-service';

let runtime: Promise<TrackerService> | undefined;
export function getTracker(): Promise<TrackerService> {
  runtime ??= (async () => {
    const repository = new SqlLedgerRepository(await openStorage());
    await repository.initialize();
    return new TrackerService(repository, randomUUID);
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
