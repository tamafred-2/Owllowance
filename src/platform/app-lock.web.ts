// The web version has no device unlock; App lock is offered on the phone only.
export const canLockApp = false;

export async function lockAvailable(): Promise<boolean> {
  return false;
}

export async function unlockWithDevice(): Promise<boolean> {
  return true;
}

export function onAppStateChange(_listener: (active: boolean) => void): () => void {
  return () => undefined;
}
