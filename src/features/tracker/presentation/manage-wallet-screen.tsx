import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import type { Wallet } from '../../../domain/ledger';
import { ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';

function WalletEditor({ wallet }: { wallet: Wallet }) {
  const { service, refresh, error: storageError } = useTracker();
  const [name, setName] = useState(wallet.name);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save(action: 'rename' | 'archive' | 'restore') {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (action === 'rename') await service.repository.renameWallet(wallet.id, name);
      else await service.repository.setWalletArchived(wallet.id, action === 'archive');
      await refresh();
      router.replace('/accounts');
    } catch (failure) {
      setError(failure instanceof ValidationError ? failure.message : 'Could not update this wallet. Try again.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const disabled = busy || Boolean(storageError);
  return <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back to Wallet" icon="back" variant="quiet" disabled={busy} onPress={() => router.replace('/accounts')} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Manage wallet</AppText>
      <Surface style={{ gap: 20 }}>
        <AppText tone="secondary">{wallet.archivedAt ? 'Archived balance' : 'Current balance'}</AppText>
        <MoneyText value={wallet.balanceMinor} size={28} fit />
        <FormField label="Wallet name" value={name} onChangeText={setName} maxLength={60} editable={!disabled} />
        <Button label="Save name" disabled={disabled} onPress={() => { void save('rename'); }} />
        {wallet.archivedAt ? <>
          <AppText size={14} tone="secondary">Restore this wallet to use it for new expenses.</AppText>
          <Button label="Restore wallet" variant="secondary" disabled={disabled} onPress={() => { void save('restore'); }} />
        </> : confirmArchive ? <View style={{ gap: 12 }}>
          <AppText weight="600">Archive this wallet?</AppText>
          <AppText size={14} tone="secondary">Its history stays available and its balance stays in your totals. New expenses cannot use it. You can restore it anytime.</AppText>
          <Button label="Confirm archive" variant="secondary" disabled={disabled} onPress={() => { void save('archive'); }} />
          <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirmArchive(false)} />
        </View> : <Button label="Archive wallet" variant="secondary" disabled={disabled} onPress={() => setConfirmArchive(true)} />}
        {busy ? <AppText size={14} tone="secondary">Saving...</AppText> : null}
        {error ? <Feedback error>{error}</Feedback> : null}
      </Surface>
    </View>
  </ScrollView>;
}

export function ManageWalletScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { overview } = useTracker();
  const wallet = [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])].find(item => item.id === id);
  if (!overview) return null;
  if (!wallet) return <View style={{ padding: 24, gap: 16 }}><AppText>Wallet not found.</AppText><Button label="Open Wallet" onPress={() => router.replace('/accounts')} /></View>;
  return <WalletEditor key={wallet.id} wallet={wallet} />;
}
