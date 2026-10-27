import { getRandomBytes } from 'expo-crypto';

// Cryptographically secure random bytes (backup salts and nonces).
export function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length);
}
