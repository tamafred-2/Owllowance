import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, FormField, Surface } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { walletKindLabels, type WalletKind } from '../../../domain/ledger';
import { useWalletSetup } from './use-entry-forms';
import { nextWalletName, walletPresets } from '../../../design-system/wallet-appearance';
import { WalletBadge } from '../../../components/wallet-card';
import { useTracker } from './tracker-context';

export function NewWalletScreen() {
  const form = useWalletSetup(() => router.replace('/accounts'));
  const { colors } = useTheme();
  const { error, overview } = useTracker();
  return <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back to Wallet" icon="back" variant="quiet" disabled={form.busy} onPress={() => router.replace('/accounts')} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Add a wallet</AppText>
      <Surface style={{ gap: 20 }}>
        <View style={{ gap: 8 }}><AppText size={14}>1. Wallet type</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(walletKindLabels) as WalletKind[]).map(kind => <Pressable key={kind} accessibilityRole="radio" accessibilityLabel={walletKindLabels[kind]}
            accessibilityState={{ checked: form.kind === kind, disabled: form.busy }} aria-checked={form.kind === kind} disabled={form.busy} onPress={() => {
              if (kind === form.kind) return;
              form.setKind(kind);
              const name = form.name.trim().toLowerCase();
              const generated = [...Object.values(walletKindLabels), ...walletPresets.map(preset => preset.name)].some(base => name === base.toLowerCase() || name.startsWith(`${base.toLowerCase()} `));
              if (generated) form.setName(nextWalletName(walletKindLabels[kind], [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])]));
            }}
            style={{ minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 8, borderColor: form.kind === kind ? colors.accent : colors.border, backgroundColor: form.kind === kind ? colors.muted : colors.surface }}>
            <AppText size={14}>{walletKindLabels[kind]}</AppText>
          </Pressable>)}
        </View><AppText size={12} tone="secondary">{form.kind === 'cash' ? 'Physical money you keep on hand.' : form.kind === 'bank' ? 'Bank accounts, including digital banks like GoTyme.' : 'Wallet balances, such as GCash or Maya Wallet.'}</AppText></View>
        {form.kind !== 'cash' ? <View style={{ gap: 10 }}><AppText size={14} weight="500">2. Provider (optional)</AppText>
          <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {walletPresets.filter(preset => preset.kind === form.kind).map(preset => <Pressable key={preset.name} accessibilityRole="button" accessibilityLabel={`Use ${preset.name} preset`} disabled={form.busy}
              onPress={() => { form.setName(nextWalletName(preset.name, [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])])); form.setKind(preset.kind); }}
              style={{ alignItems: 'center', gap: 6, padding: 8, minWidth: 76, borderRadius: 12, backgroundColor: colors.muted }}>
              <WalletBadge name={preset.name} kind={preset.kind} /><AppText size={12}>{preset.name}</AppText>
            </Pressable>)}
          </ScrollView>
        </View> : null}
        <FormField label="Wallet name" value={form.name} onChangeText={form.setName} maxLength={60} editable={!form.busy} />
        <FormField label="Opening balance (PHP)" value={form.amount} onChangeText={form.setAmount} keyboardType="decimal-pad" editable={!form.busy} hint="Money already in this wallet. This is not income." />
        {form.error ? <Feedback error>{form.error}</Feedback> : null}
        <Button label="Create wallet" icon="add" busy={form.busy} disabled={Boolean(error)} onPress={() => { void form.submit(); }} />
      </Surface>
    </View>
  </ScrollView>;
}
