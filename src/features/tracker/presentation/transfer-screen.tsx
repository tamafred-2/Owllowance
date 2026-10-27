import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { eventTime } from '../../../domain/date';
import { parseAmount } from '../../../domain/money';
import { walletKindLabels, type Wallet } from '../../../domain/ledger';
import { DateField } from '../../../components/date-field';
import { WalletBadge } from '../../../components/wallet-card';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { useTracker } from './tracker-context';
import { useTransferForm } from './use-entry-forms';
import { leaveTo, originOf } from './navigation';

function amountOrZero(input: string): number {
  try { return input.trim() ? parseAmount(input, true) : 0; } catch { return 0; }
}

function WalletChoices({ label, wallets, all, selected, disabledId, onSelect, busy }: { label: string; wallets: Wallet[]; all: Wallet[]; selected: string; disabledId: string; onSelect: (id: string) => void; busy: boolean }) {
  const { colors } = useTheme();
  return <View style={{ gap: 10 }}><AppText size={14} weight="500">{label}</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {wallets.map(wallet => {
        const checked = selected === wallet.id;
        const blocked = wallet.id === disabledId;
        return <Pressable key={wallet.id} accessibilityRole="radio" accessibilityLabel={`${label}: ${walletLabel(wallet, all)}`} accessibilityState={{ checked, disabled: busy || blocked }} aria-checked={checked}
          disabled={busy || blocked} onPress={() => onSelect(wallet.id)}
          style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderRadius: 16, opacity: blocked ? 0.45 : 1,
            borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.muted : colors.surface }}>
          <WalletBadge name={wallet.name} kind={wallet.kind} />
          <View style={{ flexShrink: 1 }}><AppText size={14}>{walletLabel(wallet, all)}</AppText><MoneyText value={wallet.balanceMinor} size={12} style={{ fontWeight: '400' }} /></View>
          {checked ? <AppIcon name="check" size={16} color={colors.accent} /> : null}
        </Pressable>;
      })}
    </View>
  </View>;
}

export function TransferScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ from?: string; walletId?: string }>();
  const { overview, error } = useTracker();
  const origin = originOf(params.from, params.walletId);
  const originWalletId = params.walletId ?? '';
  const form = useTransferForm(() => leaveTo(origin, originWalletId, 'transfer'), { fromWalletId: originWalletId || undefined });
  if (!overview) return null;
  const wallets = overview.wallets;
  const all = [...wallets, ...overview.archivedWallets];
  if (wallets.length < 2) return <View style={{ padding: 24, gap: 16, maxWidth: 620, width: '100%', alignSelf: 'center' }}>
    <AppText accessibilityRole="header" size={28} weight="600">Transfer</AppText>
    <AppText tone="secondary">You need at least two active wallets to move money between them.</AppText>
    <Button label="Add wallet" icon="add" onPress={() => router.replace('/wallet-new')} />
    <Button label="Go back" variant="quiet" onPress={() => leaveTo(origin, originWalletId)} />
  </View>;
  const from = wallets.find(wallet => wallet.id === form.fromWalletId);
  const to = wallets.find(wallet => wallet.id === form.toWalletId);
  // Opened from a wallet: that wallet is the fixed source and only the destination is chosen.
  const fixedSource = Boolean(originWalletId) && from?.id === originWalletId;
  const amount = amountOrZero(form.amount), fee = amountOrZero(form.fee);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
      <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 24 }}>
        <View style={{ alignSelf: 'flex-start' }}><Button label={origin === 'home' ? 'Back to Home' : origin === 'history' ? 'Back to History' : 'Back to wallet'} icon="back" iconOnly variant="quiet" disabled={form.busy} onPress={() => leaveTo(origin, originWalletId)} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <AppText accessibilityRole="header" size={28} weight="600">Transfer</AppText>
          <DateField label="Date" compact value={form.localDate} onChange={form.setLocalDate} max={eventTime().localDate} disabled={form.busy} />
        </View>
        <Surface style={{ gap: 24 }}>
          {fixedSource && from ? <View testID="transfer-source" style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.muted }}>
              <WalletBadge name={from.name} kind={from.kind} />
              <View style={{ flex: 1 }}><AppText size={16} weight="600">{walletLabel(from, all)}</AppText><AppText size={12} tone="secondary">{walletKindLabels[from.kind]} / PHP</AppText></View>
              <View style={{ alignItems: 'flex-end' }}><AppText size={11} tone="secondary">Balance</AppText><MoneyText value={from.balanceMinor} size={16} /></View>
            </View>
          </View> : <WalletChoices label="Send from" wallets={wallets} all={all} selected={form.fromWalletId} disabledId="" busy={form.busy}
            onSelect={id => { form.setFromWalletId(id); if (id === form.toWalletId) form.setToWalletId(''); }} />}
          <FormField label="Amount (PHP)" placeholder="0.00" value={form.amount} onChangeText={form.setAmount} keyboardType="decimal-pad" autoFocus editable={!form.busy}
            style={{ fontSize: 40, minHeight: 92, fontVariant: ['tabular-nums'] }} />
          <WalletChoices label="Send to" wallets={fixedSource ? wallets.filter(wallet => wallet.id !== form.fromWalletId) : wallets} all={all} selected={form.toWalletId} disabledId={form.fromWalletId} onSelect={form.setToWalletId} busy={form.busy} />
          <FormField label="Transfer fee" placeholder="0.00" value={form.fee} onChangeText={form.setFee} keyboardType="decimal-pad" editable={!form.busy} />
          {from && to && amount > 0 ? <View testID="transfer-preview" style={{ gap: 6 }}>
            <AppText size={14} weight="600">Preview</AppText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><AppText size={13} tone="secondary" style={{ flexShrink: 1 }}>{walletLabel(from, all)}</AppText><MoneyText value={-(amount + fee)} size={14} /></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><AppText size={13} tone="secondary" style={{ flexShrink: 1 }}>{walletLabel(to, all)}</AppText><MoneyText value={amount} size={14} /></View>
            {fee ? <AppText size={12} tone="secondary">Includes the fee.</AppText> : null}
          </View> : null}
          {form.error ? <Feedback error>{form.error}</Feedback> : null}
          <Button label="Save transfer" icon="check" busy={form.busy} disabled={Boolean(error)} onPress={() => { void form.submit(); }} />
        </Surface>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
