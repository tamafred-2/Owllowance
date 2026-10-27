import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Chip, Feedback, MoneyText, Surface, ToggleRow } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { parseBackup, type BackupEnvelope, type BackupPreview } from '../../../domain/backup';
import { eventTime } from '../../../domain/date';
import type { Settings, ThemePreference } from '../../../domain/ledger';
import { ValidationError } from '../../../domain/money';
import { pickTextFile, saveTextFile } from '../../../platform/files';
import { useTracker } from './tracker-context';

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
  const inFlight = useRef(false);
  async function run(task: string, work: () => Promise<string | null>) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(task); setMessage(null);
    try { const text = await work(); if (text) setMessage({ text, error: false }); }
    catch (failure) { setMessage({ text: failure instanceof ValidationError ? failure.message : failure instanceof Error ? failure.message : 'Something went wrong. Your data has not been changed.', error: true }); }
    finally { inFlight.current = false; setBusy(null); }
  }
  const update = (change: Partial<Settings>) => run('settings', async () => { await service!.repository.saveSettings(change); await refresh(); return null; });
  const exportBackup = () => run('export', async () => {
    const envelope = await service!.repository.exportBackup(appVersion);
    await saveTextFile(`owllowance-backup-${eventTime().localDate}.json`, JSON.stringify(envelope), 'application/json');
    await service!.repository.saveSettings({ lastBackupAt: envelope.exportedAt });
    await refresh();
    return 'Backup file created. Keep it somewhere safe.';
  });
  const chooseBackup = () => run('pick', async () => {
    const text = await pickTextFile();
    if (text === null) return null;
    setPending(parseBackup(text));
    return null;
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
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back" icon="back" variant="quiet" onPress={() => router.replace(back)} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Settings</AppText>
      {message ? <Feedback error={message.error}>{message.text}</Feedback> : null}
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Appearance</AppText>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [ThemePreference, string][]).map(([value, label]) =>
            <Chip key={value} label={label} selected={settings?.theme === value} disabled={disabled} onPress={() => { void update({ theme: value }); }} />)}
        </View>
        <ToggleRow label="Reduce motion" description="Keep the owl and scenes still." value={settings?.reduceMotion ?? false} disabled={disabled} onChange={value => { void update({ reduceMotion: value }); }} />
      </Surface>
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Privacy</AppText>
        <ToggleRow label="Hide balances" description="Mask amounts on screen, for example in public." value={settings?.hideBalances ?? false} disabled={disabled} onChange={value => { void update({ hideBalances: value }); }} />
      </Surface>
      <Pressable accessibilityRole="link" accessibilityLabel="Manage categories" onPress={() => router.push({ pathname: '/categories', params: { from: back } })}>
        <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppIcon name="categories" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}><AppText weight="600">Categories</AppText><AppText size={13} tone="secondary">Add, rename, recolor or archive categories.</AppText></View>
          <AppIcon name="next" color={colors.textSecondary} />
        </Surface>
      </Pressable>
      <Surface style={{ gap: 14 }}>
        <AppText size={18} weight="600">Backup & restore</AppText>
        <AppText size={13} tone="secondary">Your records live only on this device. Save a backup file regularly. Backups are not encrypted, so keep the file somewhere private.</AppText>
        <AppText size={13} tone="secondary">{settings?.lastBackupAt ? `Last backup: ${when(settings.lastBackupAt)}` : 'No backup made yet.'}</AppText>
        <Button label="Export backup" icon="download" busy={busy === 'export'} disabled={disabled} onPress={() => { void exportBackup(); }} />
        <Button label="Restore from backup" icon="upload" variant="secondary" busy={busy === 'pick'} disabled={disabled} onPress={() => { void chooseBackup(); }} />
        {overview?.restoreSnapshotAt ? <Button label="Undo last restore" icon="undo" variant="quiet" disabled={disabled} onPress={() => setConfirmUndo(true)} /> : null}
      </Surface>
      <AppText size={12} tone="secondary" style={{ textAlign: 'center' }}>{`Owllowance ${appVersion}`}</AppText>
    </View>
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
    <AppModal title="Undo the last restore?" visible={confirmUndo} onClose={() => { if (!busy) setConfirmUndo(false); }}>
      <AppText size={14} tone="secondary">{`Your data from ${overview?.restoreSnapshotAt ? when(overview.restoreSnapshotAt) : 'before the restore'} comes back. Changes made since the restore will be lost.`}</AppText>
      <Button label="Confirm undo" busy={busy === 'undo'} onPress={() => { void undo(); }} />
      <Button label="Cancel" variant="quiet" disabled={busy === 'undo'} onPress={() => setConfirmUndo(false)} />
    </AppModal>
  </ScrollView>;
}
