import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { useTracker } from './tracker-context';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { WalletBadge } from '../../../components/wallet-card';
import { useTransactionForm } from './use-entry-forms';

export function ExpenseScreen() {
  const { overview, error } = useTracker();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ mode?: string; walletId?: string; from?: string }>();
  const initialWalletId = typeof params.walletId === 'string' ? params.walletId : '';
  // Return to the screen that opened the form; Manage wallet follows the wallet actually saved to.
  const origin = params.from === 'manage' && initialWalletId ? 'manage' : params.from === 'wallet' ? 'wallet' : 'home';
  const [mode, setMode] = useState<'expense' | 'income'>(params.mode === 'income' ? 'income' : 'expense');
  const leave = (walletId: string, saved?: 'expense' | 'income') => {
    const extra = saved ? { saved } : {};
    if (origin === 'manage') router.replace({ pathname: '/wallet-manage', params: { id: walletId, ...extra } });
    else router.replace({ pathname: origin === 'wallet' ? '/accounts' : '/', params: extra });
  };
  const expenseForm = useTransactionForm(walletId => leave(walletId, 'expense'), 'expense', initialWalletId);
  const incomeForm = useTransactionForm(walletId => leave(walletId, 'income'), 'income', initialWalletId);
  const form = mode === 'expense' ? expenseForm : incomeForm;
  const categories = mode === 'expense' ? overview?.categories : overview?.incomeCategories;
  const [showNote, setShowNote] = useState(false);
  if (!overview?.wallet) return <View style={{ padding: 24, gap: 16 }}><AppText>Add or restore a wallet to record a transaction.</AppText><Button label="Open Wallet" onPress={() => router.replace('/accounts')} /></View>;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
      <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 24 }}>
        <View style={{ alignSelf: 'flex-start' }}><Button label={origin === 'home' ? 'Back to Home' : 'Back to wallet'} icon="back" variant="quiet" disabled={form.busy} onPress={() => leave(initialWalletId)} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ padding: 10, borderRadius: 14, backgroundColor: colors.muted }}><AppIcon name={mode} color={colors.accent} /></View><AppText size={28} weight="600">{mode === 'expense' ? 'Add an expense' : 'Add income'}</AppText></View>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.muted }}>
          {(['expense', 'income'] as const).map(type => <Pressable key={type} accessibilityRole="tab" accessibilityLabel={type === 'expense' ? 'Expense' : 'Income'} accessibilityState={{ selected: mode === type, disabled: form.busy }} aria-selected={mode === type} disabled={form.busy}
            onPress={() => { (type === 'expense' ? expenseForm : incomeForm).setWalletId(form.walletId); setMode(type); }}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mode === type ? colors.accent : 'transparent' }}>
            <AppText size={14} weight="600" style={{ color: mode === type ? colors.onAccent : colors.textSecondary }}>{type === 'expense' ? 'Expense' : 'Income'}</AppText>
          </Pressable>)}
        </View>
        <Surface style={{ gap: 24 }}>
          <FormField label="Amount (PHP)" placeholder="0.00" value={form.amount} onChangeText={form.setAmount} keyboardType="decimal-pad" autoFocus
            editable={!form.busy} style={{ fontSize: 40, minHeight: 92, fontVariant: ['tabular-nums'] }} />
          <View style={{ gap: 10 }}><AppText size={14} weight="500">Category</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(categories ?? []).map(category => {
                const selected = form.categoryId === category.id;
                return <Pressable key={category.id} accessibilityRole="radio" accessibilityLabel={category.name} accessibilityState={{ checked: selected, disabled: form.busy }} aria-checked={selected} aria-disabled={form.busy}
                  disabled={form.busy} onPress={() => form.setCategoryId(category.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, paddingHorizontal: 12, flexBasis: '46%', flexGrow: 1,
                    borderWidth: 1, borderRadius: 16, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.muted : colors.surface }}>
                  <AppIcon name={category.iconKey as IconName} size={22} color={selected ? colors.accent : colors.textSecondary} />
                  <AppText size={13} style={{ flex: 1 }}>{category.name}</AppText>{selected ? <AppIcon name="check" size={16} color={colors.accent} /> : null}
                </Pressable>;
              })}
            </View>
          </View>
          <View style={{ gap: 10 }}><AppText size={14} weight="500">Wallet</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {overview.wallets.map(wallet => <Pressable key={wallet.id} accessibilityRole="radio" accessibilityLabel={`Wallet: ${walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])}`}
                accessibilityState={{ checked: form.walletId === wallet.id, disabled: form.busy }} aria-checked={form.walletId === wallet.id}
                disabled={form.busy} onPress={() => form.setWalletId(wallet.id)}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderRadius: 16, borderColor: form.walletId === wallet.id ? colors.accent : colors.border, backgroundColor: form.walletId === wallet.id ? colors.muted : colors.surface }}>
                <WalletBadge name={wallet.name} kind={wallet.kind} /><AppText size={14} style={{ flexShrink: 1 }}>{walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])}</AppText>{form.walletId === wallet.id ? <AppIcon name="check" size={16} color={colors.accent} /> : null}
              </Pressable>)}
            </View>
            {form.wallet ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><AppText size={12} tone="secondary">Current balance</AppText><MoneyText value={form.wallet.balanceMinor} size={14} /></View> : null}
          </View>
          {showNote ? <FormField label="Note (optional)" value={form.note} onChangeText={form.setNote} maxLength={500} multiline editable={!form.busy} placeholder="What was it for?" /> :
            <Button label="Add a note" icon="add" variant="quiet" disabled={form.busy} onPress={() => setShowNote(true)} />}
          {form.error ? <Feedback error>{form.error}</Feedback> : null}
          <Button label={mode === 'expense' ? 'Save expense' : 'Save income'} icon="check" busy={form.busy} disabled={Boolean(error)} onPress={() => { void form.submit(); }} />
        </Surface>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
