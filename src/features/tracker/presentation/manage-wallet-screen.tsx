import { WalletHistory } from './wallet-history';
import { RenameWalletModal } from './rename-wallet-modal';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { AppText, Button, MoneyText, Surface } from '../../../design-system/primitives';
import type { Wallet } from '../../../domain/ledger';
import { walletKindLabels } from '../../../domain/ledger';
import { WalletBadge } from '../../../components/wallet-card';
import { useTracker } from './tracker-context';
import { SavedFeedback } from './saved-feedback';
import { BalanceEye } from './balance-eye';

function WalletEditor({ wallet, saved }: { wallet: Wallet; saved?: string }) {
  const { overview, error: storageError } = useTracker();
  const [renaming, setRenaming] = useState(false);
  const disabled = Boolean(storageError);
  return <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Back to Wallet" icon="back" iconOnly variant="quiet" onPress={() => router.replace('/accounts')} />
        <Button label="Edit name" icon="edit" iconOnly variant="quiet" disabled={disabled || renaming} onPress={() => setRenaming(true)} />
      </View>
      <AppText accessibilityRole="header" size={28} weight="600">Manage wallet</AppText>
      <SavedFeedback saved={saved} />
      <Surface style={{ gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <WalletBadge name={wallet.name} kind={wallet.kind} />
          <View style={{ flex: 1 }}><AppText size={20} weight="600">{wallet.name}</AppText><AppText size={12} tone="secondary">{walletKindLabels[wallet.kind]} / PHP{wallet.archivedAt ? ' / Archived' : ''}</AppText></View>
        </View>
        <View style={{ gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><AppText size={14} tone="secondary">{wallet.archivedAt ? 'Archived balance' : 'Current balance'}</AppText><BalanceEye /></View><MoneyText value={wallet.balanceMinor} size={32} fit /></View>
        {!wallet.archivedAt ? <Button label="Add money" disabled={disabled} onPress={() => router.push({ pathname: '/expense', params: { mode: 'income', walletId: wallet.id, from: 'manage' } })} /> : null}
        {!wallet.archivedAt && (overview?.wallets.length ?? 0) > 1 ? <Button label="Transfer" icon="transfer" variant="secondary" disabled={disabled} onPress={() => router.push({ pathname: '/transfer', params: { walletId: wallet.id, from: 'manage' } })} /> : null}
      </Surface>
      <WalletHistory walletId={wallet.id} />
      {renaming ? <RenameWalletModal wallet={wallet} onClose={() => setRenaming(false)} /> : null}
    </View>
  </ScrollView>;
}

export function ManageWalletScreen() {
  const { id, saved } = useLocalSearchParams<{ id?: string; saved?: string }>();
  const { overview } = useTracker();
  const wallet = [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])].find(item => item.id === id);
  if (!overview) return null;
  if (!wallet) return <View style={{ padding: 24, gap: 16 }}><AppText>Wallet not found.</AppText><Button label="Open Wallet" onPress={() => router.replace('/accounts')} /></View>;
  return <WalletEditor key={wallet.id} wallet={wallet} saved={saved} />;
}
