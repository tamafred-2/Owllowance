import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { checkBackupPassword, decryptBackup, encryptBackup, isEncryptedBackup } from '../src/domain/backup-crypto';

const random = (length: number) => new Uint8Array(randomBytes(length));

test('password-protected backups round-trip, reject wrong passwords and tampering, and hide the contents', async () => {
  const json = JSON.stringify({ format: 'owllowance-backup', records: { note: 'Lunch with Ana ₱150' } });
  const sealed = await encryptBackup(json, 'correct horse', random);
  assert.ok(isEncryptedBackup(sealed));
  assert.ok(!isEncryptedBackup(json));
  assert.ok(!sealed.includes('Ana'));
  assert.equal(await decryptBackup(sealed, 'correct horse'), json);
  await assert.rejects(decryptBackup(sealed, 'wrong horse'), /password is not right/);
  const file = JSON.parse(sealed);
  const tampered = { ...file, data: file.data.slice(0, -4) + (file.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(decryptBackup(JSON.stringify(tampered), 'correct horse'), /password is not right|damaged/);
  await assert.rejects(decryptBackup(JSON.stringify({ ...file, iterations: 10 }), 'correct horse'), /unsupported/);
  assert.notEqual(JSON.parse(await encryptBackup(json, 'correct horse', random)).salt, file.salt); // Fresh salt each time.
  await assert.rejects(encryptBackup(json, 'short', random), /at least 8/);
  assert.throws(() => checkBackupPassword('longenough', 'different'), /do not match/);
});
