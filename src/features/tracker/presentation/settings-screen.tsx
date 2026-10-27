import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Chip, Feedback, FormField, MoneyText, Surface, ToggleRow } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { parseBackup, type BackupEnvelope, type BackupPreview } from '../../../domain/backup';
import { eventTime } from '../../../domain/date';
import type { Settings, ThemePreference } from '../../../domain/ledger';
import { ValidationError } from '../../../domain/money';
import { checkBackupPassword, decryptBackup, encryptBackup, isEncryptedBackup } from '../../../domain/backup-crypto';
import { pickTextFile, saveTextFile } from '../../../platform/files';
import { canLockApp, lockAvailable, unlockWithDevice } from '../../../platform/app-lock';
import { randomBytes } from '../../../platform/random';
import { markAppUnlocked } from './app-lock';
import { useTracker } from './tracker-context';
import { ReminderToggle } from './reminders';
import { GettingStarted } from './getting-started';

const appVersion = Constants.expoConfig?.version ?? '0.1.0';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function SettingsScreen() {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors } = useTheme();
  const settings = overview?.settings;
  const { from } = useLocalSearchParams<{ from?: string }>();
  // Only main pages are valid return targets.
  const back = (['/accounts', '/plan', '/activity'] as const).find(page => page === from) ?? '/';
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ envelope: BackupEnvelope; preview: BackupPreview } | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Export asks for an optional password; an encrypted file asks for its password before the preview.
  const [exporting, setExporting] = useState(false);
  const [lockedFile, setLockedFile] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const inFlight = useRef(false);
  async function run(task: string, work: () => Promise<string | null>) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(task); setMessage(null);
    try { const text = await work(); if (text) setMessage({ text, error: false }); }
    catch (failure) { setMessage({ text: failure instanceof ValidationError ? failure.message : failure instanceof Error ? failure.message : 'Something went wrong. Your data has not been changed.', error: true }); }
    finally { inFlight.current = false; setBusy(null); }
  }
  const update = (change: Partial<Settings>) => run('settings', async () => { await service!.repository.saveSettings(change); await refresh(); return null; });
  const closePassword = () => { setExporting(false); setLockedFile(null); setPassword(''); setConfirmation(''); };
  const exportBackup = (protect: boolean) => run('export', async () => {
    if (protect) checkBackupPassword(password, confirmation);
    const envelope = await service!.repository.exportBackup(appVersion);
    const json = JSON.stringify(envelope);
    const date = eventTime().localDate;
    if (protect) await saveTextFile(`owllowance-backup-${date}-protected.json`, await encryptBackup(json, password, randomBytes), 'application/json');
    else await saveTextFile(`owllowance-backup-${date}.json`, json, 'application/json');
    await service!.repository.saveSettings({ lastBackupAt: envelope.exportedAt });
    await refresh();
    closePassword();
    return protect ? 'Password-protected backup created. Keep the password safe: it cannot be recovered.' : 'Backup file created. Keep it somewhere safe.';
  });
  const chooseBackup = () => run('pick', async () => {
    const text = await pickTextFile();
    if (text === null) return null;
    if (isEncryptedBackup(text)) { setLockedFile(text); return null; }
    setPending(parseBackup(text));
    return null;
  });
  const openLockedFile = () => run('decrypt', async () => {
    const parsed = parseBackup(await decryptBackup(lockedFile!, password));
    closePassword();
    setPending(parsed);
    return null;
  });
  // Turning the lock on or off needs the phone's own unlock first.
  const setAppLock = (value: boolean) => run('lock', async () => {
    if (value && !await lockAvailable()) throw new ValidationError('Set a screen lock (PIN, pattern or password) on your phone first.');
    if (!await unlockWithDevice()) return null;
    await service!.repository.saveSettings({ appLock: value });
    if (value) markAppUnlocked();
    await refresh();
    return value ? 'App lock is on.' : 'App lock is off.';
  });
  const restore = () => run('restore', async () => {
    await service!.repository.restoreBackup(pending!.envelope);
    setPending(null);
    await refresh();
    return 'Backup restored. You can undo this below.';
  });
  const undo = () => run('undo', async () => {
    await service!.repository.undoRestore();
    setConfirmUndo(false);
    await refresh();
    return 'Your data from before the restore is back.';
  });
  const disabled = Boolean(busy) || Boolean(storageError) || !settings;
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back" icon="back" iconOnly variant="quiet" onPress={() => router.replace(back)} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Settings</AppText>
      {message && !exporting && lockedFile === null ? <Feedback error={message.error}>{message.text}</Feedback> : null}
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Appearance</AppText>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [ThemePreference, string][]).map(([value, label]) =>
            <Chip key={value} label={label} selected={settings?.theme === value} disabled={disabled} onPress={() => { void update({ theme: value }); }} />)}
        </View>
      </Surface>
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Reminders</AppText>
        <ReminderToggle />
      </Surface>
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Security</AppText>
        <ToggleRow label="App lock" description={canLockApp ? 'Ask for your fingerprint, face or phone PIN when opening Owllowance, and after 30 seconds away.' : 'Available in the Android app.'}
          value={settings?.appLock ?? false} disabled={!canLockApp || disabled} onChange={value => { void setAppLock(value); }} />
      </Surface>
      <Pressable accessibilityRole="button" accessibilityLabel="How to use Owllowance" onPress={() => setGuideOpen(true)}>
        <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppIcon name="activity" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}><AppText weight="600">How to use Owllowance</AppText><AppText size={13} tone="secondary">A quick tour of the main features.</AppText></View>
          <AppIcon name="next" color={colors.textSecondary} />
        </Surface>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel="Manage categories" onPress={() => router.push({ pathname: '/categories', params: { from: back } })}>
        <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppIcon name="categories" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}><AppText weight="600">Categories</AppText><AppText size={13} tone="secondary">Add, rename, recolor or archive categories.</AppText></View>
          <AppIcon name="next" color={colors.textSecondary} />
        </Surface>
      </Pressable>
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Backup & restore</AppText>
        <AppText size={13} tone="secondary">Your records live only on this device. Save a backup file regularly. Add a password to encrypt the file so only you can open it.</AppText>
        <AppText size={13} tone="secondary">{settings?.lastBackupAt ? `Last backup: ${when(settings.lastBackupAt)}` : 'No backup made yet.'}</AppText>
        <Button label="Export backup" icon="download" busy={busy === 'export' && !exporting} disabled={disabled} onPress={() => { setMessage(null); setExporting(true); }} />
        <Button label="Restore from backup" icon="upload" variant="secondary" busy={busy === 'pick'} disabled={disabled} onPress={() => { void chooseBackup(); }} />
        {overview?.restoreSnapshotAt ? <Button label="Undo last restore" icon="undo" variant="quiet" disabled={disabled} onPress={() => setConfirmUndo(true)} /> : null}
      </Surface>
      <AppText size={12} tone="secondary" style={{ textAlign: 'center' }}>{`Owllowance ${appVersion}`}</AppText>
    </View>
    {guideOpen ? <GettingStarted onDone={() => setGuideOpen(false)} /> : null}
    <AppModal title="Replace data with this backup?" visible={Boolean(pending)} onClose={() => { if (!busy) setPending(null); }}>
      {pending ? <View testID="restore-preview" style={{ gap: 6 }}>
        <AppText size={14}>{`Backup from ${when(pending.preview.exportedAt)}`}</AppText>
        <AppText size={14} tone="secondary">{`${pending.preview.wallets} wallets · ${pending.preview.transactions} transactions · ${pending.preview.categories} categories · ${pending.preview.budgets} budgets`}</AppText>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><AppText size={14} tone="secondary">Total balance</AppText><MoneyText value={pending.preview.totalBalanceMinor} size={14} /></View>
        <AppText size={14} tone="secondary">Everything currently on this device will be replaced. A safety copy is kept so you can undo once.</AppText>
      </View> : null}
      <Button label="Replace and restore" busy={busy === 'restore'} disabled={Boolean(storageError)} onPress={() => { void restore(); }} />
      <Button label="Cancel" variant="quiet" disabled={busy === 'restore'} onPress={() => setPending(null)} />
    </AppModal>
    <AppModal title={exporting ? 'Protect this backup?' : 'Backup password'} visible={exporting || lockedFile !== null} onClose={() => { if (!busy) closePassword(); }}>
      <AppText size={14} tone="secondary">{exporting ? 'With a password, the file is encrypted and only opens with it. A forgotten password cannot be recovered.' : 'This backup is password-protected. Enter its password to continue.'}</AppText>
      <FormField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="off" editable={!busy} />
      {exporting ? <FormField label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoComplete="off" editable={!busy} /> : null}
      {message?.error ? <Feedback error>{message.text}</Feedback> : null}
      {exporting ? <>
        <Button label="Export with password" icon="local" busy={busy === 'export'} disabled={Boolean(busy)} onPress={() => { void exportBackup(true); }} />
        <Button label="Export without password" variant="secondary" disabled={Boolean(busy)} onPress={() => { void exportBackup(false); }} />
      </> : <Button label="Open backup" busy={busy === 'decrypt'} disabled={Boolean(busy)} onPress={() => { void openLockedFile(); }} />}
      <Button label="Cancel" variant="quiet" disabled={Boolean(busy)} onPress={closePassword} />
    </AppModal>
    <AppModal title="Undo the last restore?" visible={confirmUndo} onClose={() => { if (!busy) setConfirmUndo(false); }}>
      <AppText size={14} tone="secondary">{`Your data from ${overview?.restoreSnapshotAt ? when(overview.restoreSnapshotAt) : 'before the restore'} comes back. Changes made since the restore will be lost.`}</AppText>
      <Button label="Confirm undo" busy={busy === 'undo'} onPress={() => { void undo(); }} />
      <Button label="Cancel" variant="quiet" disabled={busy === 'undo'} onPress={() => setConfirmUndo(false)} />
    </AppModal>
  </ScrollView>;
}
