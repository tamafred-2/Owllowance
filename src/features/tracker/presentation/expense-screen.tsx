import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { AppText, Button, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { ActivityItem, Category } from '../../../domain/ledger';
import { displayDate, eventTime } from '../../../domain/date';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { useTracker } from './tracker-context';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { WalletBadge } from '../../../components/wallet-card';
import { useTransactionForm, type EntryDraft } from './use-entry-forms';
import { leaveTo, originOf, type Origin } from './navigation';
import { useSheetFrame } from './sheet-context';
import { SheetScrollView } from './sheet-scroll-view';

type Params = { mode?: string; walletId?: string; from?: string; edit?: string; duplicate?: string };

// Loads the source transaction for edit/duplicate before mounting the form with its values.
export function ExpenseScreen() {
  const frame = useSheetFrame();
  const routeParams = useLocalSearchParams<Params>();
  const params: Params = frame ? frame.params : routeParams;
  const { service, overview } = useTracker();
  const sourceId = params.edit || params.duplicate || '';
  const [source, setSource] = useState<ActivityItem | null | undefined>(sourceId ? undefined : null);
  useEffect(() => {
    if (!sourceId || !service) return;
    let live = true;
    service.repository.transaction(sourceId).then(item => { if (live) setSource(item); }, () => { if (live) setSource(null); });
    return () => { live = false; };
  }, [service, sourceId]);
  const origin = originOf(params.from, params.walletId);
  if (!overview || source === undefined) return null;
  if (sourceId && (!source || (source.type !== 'expense' && source.type !== 'income'))) {
    return <View style={{ padding: 24, gap: 16 }}><AppText>This transaction is no longer available.</AppText><Button label="Go back" onPress={() => leaveTo(origin, params.walletId ?? '')} /></View>;
  }
  if (!overview.wallet && !params.edit) return <View style={{ padding: 24, gap: 16 }}><AppText>Add or restore a wallet to record a transaction.</AppText><Button label="Open Wallet" onPress={() => router.replace('/accounts')} /></View>;
  const editing = params.edit && source ? source : undefined;
  const draft: EntryDraft = source ? {
    walletId: source.walletId, categoryId: source.categoryId ?? '', amount: (Math.abs(source.amountMinor) / 100).toFixed(2), note: source.note,
    localDate: editing ? source.localDate : eventTime().localDate,
  } : { walletId: typeof params.walletId === 'string' ? params.walletId : '' };
  const mode = source ? source.type as 'expense' | 'income' : params.mode === 'income' ? 'income' : 'expense';
  return <EntryEditor key={`${sourceId}-${editing?.revision ?? 0}`} origin={origin} originWalletId={params.walletId ?? ''} initialMode={mode} draft={draft} editing={editing} />;
}

function EntryEditor({ origin, originWalletId, initialMode, draft, editing }: { origin: Origin; originWalletId: string; initialMode: 'expense' | 'income'; draft: EntryDraft; editing?: ActivityItem }) {
  const { service, overview, refresh, error } = useTracker();
  const { colors, isDark } = useTheme();
  const [mode, setMode] = useState(initialMode);
  const frame = useSheetFrame();
  const leave = (walletId: string, saved?: string) => frame ? frame.close(saved) : leaveTo(origin, origin === 'manage' ? walletId || originWalletId : originWalletId, saved);
  const expenseForm = useTransactionForm(walletId => leave(walletId, editing ? 'updated' : 'expense'), 'expense', draft, editing?.type === 'expense' ? editing : undefined);
  const incomeForm = useTransactionForm(walletId => leave(walletId, editing ? 'updated' : 'income'), 'income', draft, editing?.type === 'income' ? editing : undefined);
  const form = mode === 'expense' ? expenseForm : incomeForm;
  const [showNote, setShowNote] = useState(Boolean(draft.note));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inFlight = useRef(false);
  if (!overview) return null;
  const allWallets = [...overview.wallets, ...overview.archivedWallets];
  // An edit may keep an archived wallet or category that is no longer offered for new entries.
  const wallets = editing && !overview.wallets.some(wallet => wallet.id === editing.walletId)
    ? [...overview.wallets, ...overview.archivedWallets.filter(wallet => wallet.id === editing.walletId)] : overview.wallets;
  const active = mode === 'expense' ? overview.categories : overview.incomeCategories;
  const categories: Category[] = editing?.categoryId && !active.some(category => category.id === editing.categoryId)
    ? [...active, { id: editing.categoryId, name: editing.categoryName ?? '', iconKey: editing.iconKey ?? 'other', colorToken: editing.colorToken ?? 'accent' }] : active;
  const busy = form.busy || deleting;
  async function remove() {
    if (!service || !editing || inFlight.current) return;
    inFlight.current = true; setDeleting(true); setDeleteError(null);
    try {
      await service.repository.deleteTransaction(editing.id, editing.revision);
      await refresh();
      leave(editing.walletId, 'deleted');
    } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'Could not delete. Try again.'); }
    finally { inFlight.current = false; setDeleting(false); }
  }
  const heading = editing ? (mode === 'expense' ? 'Edit expense' : 'Edit income') : mode === 'expense' ? 'Add an expense' : 'Add income';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SheetScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
      <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 24 }}>
        {!frame || editing ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {frame ? <View /> : <Button label={origin === 'home' ? 'Back to Home' : origin === 'history' ? 'Back to History' : 'Back to wallet'} icon="back" iconOnly variant="quiet" disabled={busy} onPress={() => leave(originWalletId)} />}
          {editing ? <Button label="Duplicate" icon="duplicate" iconOnly variant="quiet" disabled={busy}
            onPress={() => frame ? frame.replace({ kind: 'entry', duplicate: editing.id }) : router.replace({ pathname: '/expense', params: { duplicate: editing.id, from: origin, ...(originWalletId ? { walletId: originWalletId } : {}) } })} /> : null}
        </View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}><View style={{ padding: 8, borderRadius: 12, backgroundColor: colors.muted }}><AppIcon name={mode} size={18} color={colors.accent} /></View><AppText accessibilityRole="header" size={22} weight="600" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ flexShrink: 1 }}>{heading}</AppText></View>
          <DateField label="Date" compact value={form.localDate} onChange={form.setLocalDate} max={eventTime().localDate} disabled={busy} />
        </View>
        {!editing ? <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.muted }}>
          {(['expense', 'income'] as const).map(type => <Pressable key={type} accessibilityRole="tab" accessibilityLabel={type === 'expense' ? 'Expense' : 'Income'} accessibilityState={{ selected: mode === type, disabled: busy }} aria-selected={mode === type} disabled={busy}
            onPress={() => { const target = type === 'expense' ? expenseForm : incomeForm; target.setWalletId(form.walletId); target.setLocalDate(form.localDate); setMode(type); }}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: mode === type ? colors.accent : 'transparent' }}>
            <AppText size={14} weight="600" style={{ color: mode === type ? colors.onAccent : colors.textSecondary }}>{type === 'expense' ? 'Expense' : 'Income'}</AppText>
          </Pressable>)}
        </View> : null}
        <Surface style={{ gap: 24 }}>
          <FormField label="Amount (PHP)" placeholder="0.00" value={form.amount} onChangeText={form.setAmount} keyboardType="decimal-pad" autoFocus={!editing && !frame}
            editable={!busy} style={{ fontSize: 40, minHeight: 92, fontVariant: ['tabular-nums'] }} />
          <View style={{ gap: 10 }}><AppText size={14} weight="500">Category</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              {categories.map(category => {
                const selected = form.categoryId === category.id;
                const tint = categoryColors(category.colorToken, isDark);
                return <Pressable key={category.id} accessibilityRole="radio" accessibilityLabel={category.name} accessibilityState={{ checked: selected, disabled: busy }} aria-checked={selected} aria-disabled={busy}
                  disabled={busy} onPress={() => form.setCategoryId(category.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingLeft: 8, paddingRight: 14, paddingVertical: 8, width: '48.5%',
                    borderWidth: 1, borderRadius: 16, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.muted : colors.surface }}>
                  <View style={{ padding: 5, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={category.iconKey as IconName} size={18} color={tint.foreground} /></View>
                  {/* Whole words only: the label gets the full width and the check sits in the corner. */}
                  <AppText size={12} numberOfLines={2} textBreakStrategy="simple" style={{ flex: 1 }}>{category.name}</AppText>
                  {selected ? <View style={{ position: 'absolute', top: 5, right: 5 }}><AppIcon name="check" size={13} color={colors.accent} /></View> : null}
                </Pressable>;
              })}
            </View>
          </View>
          <View style={{ gap: 10 }}><AppText size={14} weight="500">Wallet</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              {wallets.map(wallet => <Pressable key={wallet.id} accessibilityRole="radio" accessibilityLabel={`Wallet: ${walletLabel(wallet, allWallets)}`}
                accessibilityState={{ checked: form.walletId === wallet.id, disabled: busy }} aria-checked={form.walletId === wallet.id}
                disabled={busy} onPress={() => form.setWalletId(wallet.id)}
                style={{ width: '48.5%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderRadius: 16, borderColor: form.walletId === wallet.id ? colors.accent : colors.border, backgroundColor: form.walletId === wallet.id ? colors.muted : colors.surface }}>
                <WalletBadge name={wallet.name} kind={wallet.kind} /><AppText size={14} numberOfLines={2} style={{ flex: 1 }}>{walletLabel(wallet, allWallets)}</AppText>{form.walletId === wallet.id ? <View style={{ position: 'absolute', top: 5, right: 5 }}><AppIcon name="check" size={13} color={colors.accent} /></View> : null}
              </Pressable>)}
            </View>
            {form.wallet ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><AppText size={12} tone="secondary">Current balance</AppText><MoneyText value={form.wallet.balanceMinor} size={14} hidden={overview.settings.hiddenBalances.includes(form.wallet.id)} /></View> : null}
          </View>
          {showNote ? <FormField label="Note (optional)" value={form.note} onChangeText={form.setNote} maxLength={500} multiline editable={!busy} placeholder="What was it for?" /> :
            <Button label="Add a note" variant="quiet" disabled={busy} onPress={() => setShowNote(true)} />}
          {form.error ? <Feedback error>{form.error}</Feedback> : null}
          <Button label={editing ? 'Save changes' : mode === 'expense' ? 'Save expense' : 'Save income'} icon="check" busy={form.busy} disabled={Boolean(error) || deleting} onPress={() => { void form.submit(); }} />
          {editing ? <Button label={mode === 'expense' ? 'Delete expense' : 'Delete income'} icon="delete" variant="quiet" disabled={busy || Boolean(error)} onPress={() => { setDeleteError(null); setConfirmDelete(true); }} /> : null}
        </Surface>
      </View>
      {editing ? <AppModal title={mode === 'expense' ? 'Delete this expense?' : 'Delete this income?'} visible={confirmDelete} onClose={() => { if (!deleting) setConfirmDelete(false); }}>
        <AppText size={14} tone="secondary">{`${editing.categoryName} · ${displayDate(editing.localDate)}. Its wallet balance will be adjusted. This can't be undone.`}</AppText>
        {deleteError ? <Feedback error>{deleteError}</Feedback> : null}
        <Button label="Confirm delete" busy={deleting} onPress={() => { void remove(); }} />
        <Button label="Cancel" variant="quiet" disabled={deleting} onPress={() => setConfirmDelete(false)} />
      </AppModal> : null}
    </SheetScrollView>
  </KeyboardAvoidingView>;
}
