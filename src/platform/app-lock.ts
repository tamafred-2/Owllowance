import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export const canLockApp = true;

// Lock needs at least a screen PIN, pattern or password on the phone (biometrics are optional).
export async function lockAvailable(): Promise<boolean> {
  return await LocalAuthentication.getEnrolledLevelAsync() > LocalAuthentication.SecurityLevel.NONE;
}

// The system prompt: fingerprint or face where set up, otherwise the phone's PIN, pattern or password.
export async function unlockWithDevice(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Owllowance', cancelLabel: 'Cancel', disableDeviceFallback: false });
  return result.success;
}

export function onAppStateChange(listener: (active: boolean) => void): () => void {
  const subscription = AppState.addEventListener('change', state => { if (state === 'active' || state === 'background') listener(state === 'active'); });
  return () => subscription.remove();
}
