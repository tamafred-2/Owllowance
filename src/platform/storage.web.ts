import { Database } from '../data/sql';

let releaseLock: (() => void) | undefined;

async function claimDatabase(): Promise<void> {
  if (releaseLock) return;
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request('owllowance-database-v1', { ifAvailable: true }, async lock => {
      if (!lock) {
        reject(new Error('Owllowance is open in another tab. Close that tab, then retry here.'));
        return;
      }
      await new Promise<void>(release => {
        releaseLock = release;
        resolve();
      });
    }).catch(reject);
  });
}

export async function openStorage(): Promise<Database> {
  if (!globalThis.isSecureContext || !globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('Local storage needs a secure browser connection and isolation headers. Use the included web server or a correctly configured host.');
  }
  if (!navigator.locks || !navigator.storage?.getDirectory) {
    throw new Error('This browser cannot provide the local storage Owllowance needs. Try a current browser with private browsing turned off.');
  }
  await claimDatabase();
  try {
    // Probe persistent file access first; never substitute an ephemeral database.
    await navigator.storage.getDirectory();
    const { openDatabaseAsync } = await import('expo-sqlite');
    return new Database(await openDatabaseAsync('owllowance.db'));
  } catch {
    releaseLock?.();
    releaseLock = undefined;
    throw new Error('Local storage could not be opened. Check browser storage permissions and free space, then retry.');
  }
}

export async function prepareOffline(): Promise<void> {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  } catch {
    // Optional app-file caching must not block expense entry in the open page.
  }
}
