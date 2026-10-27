import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { ValidationError } from './money';

// Password-protected backups: PBKDF2-SHA256 stretches the password into a key, AES-256-GCM encrypts
// the backup JSON and detects any change to the file (or a wrong password). Nothing is stored about
// the password itself, so a forgotten password cannot be recovered.
export const ENCRYPTED_BACKUP_FORMAT = 'owllowance-backup-encrypted';
const ITERATIONS = 200_000;
const MIN_PASSWORD = 8;

type EncryptedFile = { format: typeof ENCRYPTED_BACKUP_FORMAT; version: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; cipher: 'AES-256-GCM'; nonce: string; data: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, encoder.encode(password), salt, { c: iterations, dkLen: 32 });
}

export function checkBackupPassword(password: string, confirmation: string): void {
  if (password.length < MIN_PASSWORD) throw new ValidationError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== confirmation) throw new ValidationError('The passwords do not match.');
}

export async function encryptBackup(json: string, password: string, randomBytes: (length: number) => Uint8Array): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new ValidationError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const salt = randomBytes(16), nonce = randomBytes(12);
  const key = await deriveKey(password, salt, ITERATIONS);
  const file: EncryptedFile = { format: ENCRYPTED_BACKUP_FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toBase64(salt),
    cipher: 'AES-256-GCM', nonce: toBase64(nonce), data: toBase64(gcm(key, nonce).encrypt(encoder.encode(json))) };
  return JSON.stringify(file);
}

export function isEncryptedBackup(text: string): boolean {
  try { return (JSON.parse(text) as Partial<EncryptedFile>)?.format === ENCRYPTED_BACKUP_FORMAT; } catch { return false; }
}

export async function decryptBackup(text: string, password: string): Promise<string> {
  let file: Partial<EncryptedFile>;
  try { file = JSON.parse(text) as Partial<EncryptedFile>; } catch { throw new ValidationError("This backup can't be restored: the file is damaged."); }
  if (file.format !== ENCRYPTED_BACKUP_FORMAT || file.version !== 1 || file.kdf !== 'PBKDF2-SHA256' || file.cipher !== 'AES-256-GCM'
    || !Number.isSafeInteger(file.iterations) || file.iterations! < 100_000 || file.iterations! > 5_000_000
    || typeof file.salt !== 'string' || typeof file.nonce !== 'string' || typeof file.data !== 'string') {
    throw new ValidationError("This backup can't be restored: it was made by an unsupported version of Owllowance.");
  }
  try {
    const key = await deriveKey(password, fromBase64(file.salt), file.iterations!);
    return decoder.decode(gcm(key, fromBase64(file.nonce)).decrypt(fromBase64(file.data)));
  } catch {
    throw new ValidationError('That password is not right, or the file is damaged.');
  }
}
