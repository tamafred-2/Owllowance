import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { HeaderActions } from '../../../components/header-actions';
import { AppText, Button, Chip, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import type { Debt, DebtCommand, DebtDirection, DebtEntry, DebtEntryCommand } from '../../../domain/ledger';
import { addDays, displayDate, eventTime } from '../../../domain/date';
import { formatMoney, ValidationError } from '../../../domain/money';
import { debtEntryLabel, directionLabels } from '../../../domain/debt';
import { usePullToRefresh } from './pull-to-refresh';
import { SavedFeedback } from './saved-feedback';
import { useTracker } from './tracker-context';


function useBack(onBack: () => void) {
  const ref = useRef(onBack);
  useEffect(() => { ref.current = onBack; });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { ref.current(); return true; });
    return () => subscription.remove();
  }, []);
}

// Wallet choice for a debt movement; "Record only" keeps wallets untouched (e.g. an old debt).
function WalletChoice({ label, walletId, onChange, disabled }: { label: string; walletId: string | null; onChange: (id: string | null) => void; disabled: boolean }) {
  const { overview } = useTracker();
  const wallet = overview?.wallets.find(item => item.id === walletId);
  return <View style={{ gap: 10 }}>
    <AppText size={14} weight="500">{label}</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(overview?.wallets ?? []).map(item => <Chip key={item.id} label={item.name} selected={walletId === item.id} disabled={disabled} onPress={() => onChange(item.id)} />)}
      <Chip label="Record only" selected={walletId === null} disabled={disabled} onPress={() => onChange(null)} />
    </View>
    <AppText size={12} tone="secondary">{wallet ? `Current balance ${overview?.settings.hiddenBalances.includes(wallet.id) ? '₱ ••••' : formatMoney(wallet.balanceMinor)}` : 'No wallet changes. Use this for money that moved before you started tracking.'}</AppText>
  </View>;
}

function DebtRow({ debt, first }: { debt: Debt; first: boolean }) {
  const { colors } = useTheme();
  const settled = debt.balanceMinor === 0;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open debt ${debt.name}`} onPress={() => router.push({ pathname: '/debt', params: { id: debt.id } })}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderColor: colors.border, opacity: pressed ? 0.7 : debt.archivedAt ? 0.6 : 1 })}>
    <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}>
      <AppIcon name={debt.direction === 'owe' ? 'expense' : 'income'} size={18} color={debt.direction === 'owe' ? colors.textSecondary : colors.success} />
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size={15} weight="600" numberOfLines={1}>{debt.name}</AppText>
      <AppText size={12} tone="secondary">{debt.archivedAt ? 'Archived' : settled ? 'Settled' : debt.dueDate ? `Due ${displayDate(debt.dueDate)}` : directionLabels[debt.direction]}</AppText>
    </View>
    <MoneyText value={debt.balanceMinor} size={15} style={debt.direction === 'owed' && !settled ? { color: colors.success } : undefined} />
  </Pressable>;
}

// Debts: what I owe and what others owe me. Net worth stays as wallets + goals; "after debts" is separate.
export function DebtsScreen() {
  const { overview } = useTracker();
  const { colors } = useTheme();
  const refreshControl = usePullToRefresh();
  if (!overview) return null;
  const after = overview.totalBalanceMinor - overview.oweMinor + overview.owedMinor;
  const section = (direction: DebtDirection) => {
    const list = overview.debts.filter(debt => debt.direction === direction);
    return <Surface style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText accessibilityRole="header" size={18} weight="600">{directionLabels[direction]}</AppText>
        <MoneyText value={direction === 'owe' ? overview.oweMinor : overview.owedMinor} size={16} style={direction === 'owed' ? { color: colors.success } : undefined} />
      </View>
      {list.length ? <View testID={`debts-${direction}`}>{list.map((debt, index) => <DebtRow key={debt.id} debt={debt} first={index === 0} />)}</View>
        : <AppText size={14} tone="secondary" style={{ paddingVertical: 8 }}>{direction === 'owe' ? 'Nothing you owe.' : 'Nobody owes you.'}</AppText>}
    </Surface>;
  };
  return <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button label="Back to Home" icon="back" iconOnly variant="quiet" onPress={() => router.replace('/')} />
        <AppText accessibilityRole="header" size={26} weight="700" style={{ flex: 1 }}>Debts</AppText>
        <HeaderActions />
      </View>
      <Surface style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><AppText size={14} tone="secondary">Net worth</AppText><MoneyText value={overview.totalBalanceMinor} size={15} /></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><AppText size={14} weight="600">After debts</AppText><View testID="after-debts"><MoneyText value={after} size={20} /></View></View>
        <AppText size={12} tone="secondary">Net worth counts your wallets and goals. After debts also subtracts what you owe and adds what is owed to you.</AppText>
      </Surface>
      <Button label="Add debt" icon="add" onPress={() => router.push('/debt-edit')} />
      {section('owe')}
      {section('owed')}
    </View>
  </ScrollView>;
}

function DebtMove({ debt, payment, onDone, onCancel }: { debt: Debt; payment: boolean; onDone: (message: string) => void; onCancel: () => void }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const today = eventTime().localDate;
  const [walletId, setWalletId] = useState<string | null>(overview?.wallets[0]?.id ?? null);
  const [amount, setAmount] = useState(payment ? (debt.balanceMinor / 100).toFixed(2) : '');
  const [localDate, setLocalDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: DebtEntryCommand } | null>(null);
  const label = debtEntryLabel(debt.direction, payment ? -1 : 1);
  const walletLabel = (debt.direction === 'owe') === payment ? 'Paid from' : 'Received in';
  async function submit() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { debtId: debt.id, walletId, amount, payment, localDate, note };
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, command: service.prepareDebtEntry(values) };
      const moved = Math.abs(pending.current.command.amountMinor);
      await service.repository.addDebtEntry(pending.current.command);
      pending.current = null;
      await refresh();
      onDone(`${label}: ${formatMoney(moved)}.`);
    } catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <View testID="debt-move" style={{ gap: 14 }}>
    <AppText size={16} weight="600">{label}</AppText>
    <WalletChoice label={walletLabel} walletId={walletId} onChange={setWalletId} disabled={busy} />
    <FormField label="Amount (PHP)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} selectTextOnFocus />
    <DateField label="Date" value={localDate} onChange={setLocalDate} max={today} disabled={busy} />
    <FormField label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} editable={!busy} />
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label={`Save: ${label}`} icon="check" busy={busy} disabled={Boolean(storageError)} onPress={() => { void submit(); }} />
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={onCancel} />
  </View>;
}

function DebtPage({ debt, saved }: { debt: Debt; saved?: string }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors } = useTheme();
  const refreshControl = usePullToRefresh();
  const [entries, setEntries] = useState<DebtEntry[]>([]);
  const [mode, setMode] = useState<'view' | 'pay' | 'more'>('view');
  const [message, setMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DebtEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.debtEntries(debt.id).then(rows => { if (live) setEntries(rows); }, () => undefined);
    return () => { live = false; };
  }, [service, debt.id, overview]);
  useBack(() => { if (mode !== 'view') setMode('view'); else router.replace('/debts'); });
  async function run(work: () => Promise<void>, after: () => void) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); await refresh(); after(); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not update this debt. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const archived = Boolean(debt.archivedAt);
  const disabled = Boolean(storageError) || busy;
  const owe = debt.direction === 'owe';
  return <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Back to Debts" icon="back" iconOnly variant="quiet" onPress={() => router.replace('/debts')} />
        <Button label="Edit debt" icon="edit" iconOnly variant="quiet" disabled={disabled} onPress={() => router.replace({ pathname: '/debt-edit', params: { id: debt.id } })} />
      </View>
      <View style={{ gap: 2 }}>
        <AppText size={13} tone="secondary">{directionLabels[debt.direction]}</AppText>
        <AppText accessibilityRole="header" size={26} weight="600">{debt.name}</AppText>
        {archived ? <AppText size={12} tone="secondary">Archived</AppText> : debt.dueDate ? <AppText size={13} tone={debt.dueDate < eventTime().localDate && debt.balanceMinor ? 'error' : 'secondary'}>{`Due ${displayDate(debt.dueDate)}`}</AppText> : null}
      </View>
      {debt.note ? <AppText size={15} tone="secondary">{debt.note}</AppText> : null}
      <SavedFeedback saved={saved} />
      {message ? <Feedback>{message}</Feedback> : null}
      <Surface style={{ gap: 16 }}>
        <View style={{ gap: 4 }}><AppText size={14} tone="secondary">{owe ? 'Left to pay' : 'Left to get back'}</AppText><MoneyText value={debt.balanceMinor} size={32} fit /></View>
        {debt.balanceMinor === 0 ? <AppText size={13} tone="success">Settled. You can archive it.</AppText> : null}
        {mode !== 'view' ? <DebtMove debt={debt} payment={mode === 'pay'} onCancel={() => setMode('view')} onDone={text => { setMode('view'); setMessage(text); }} />
          : !archived ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label={owe ? 'Pay back' : 'Got paid back'} icon="check" disabled={disabled || debt.balanceMinor <= 0} onPress={() => { setMessage(null); setMode('pay'); }} /></View>
            <View style={{ flex: 1 }}><Button label={owe ? 'Borrow more' : 'Lend more'} icon="add" variant="secondary" disabled={disabled} onPress={() => { setMessage(null); setMode('more'); }} /></View>
          </View> : null}
        <AppText size={12} tone="secondary">Debts don&apos;t change your net worth. Paying back from a wallet lowers that wallet; nothing counts as spending or income.</AppText>
      </Surface>
      <Surface style={{ gap: 4 }}>
        <AppText accessibilityRole="header" size={18} weight="600">History</AppText>
        {entries.length ? <View testID="debt-history">
          {entries.map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={14} weight="500">{`${debtEntryLabel(debt.direction, row.amountMinor)}${row.walletName ? ` · ${row.walletName}` : ''}`}</AppText>
              <AppText size={12} tone="secondary">{displayDate(row.localDate)}{row.note ? ` · ${row.note}` : ''}{row.walletName ? '' : ' · Record only'}</AppText>
            </View>
            <MoneyText value={Math.abs(row.amountMinor)} size={15} />
            <Button label={`Remove ${displayDate(row.localDate)} entry`} icon="close" iconOnly variant="quiet" disabled={disabled} onPress={() => { setError(null); setRemoving(row); }} />
          </View>)}
        </View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 8 }}>No entries yet.</AppText>}
      </Surface>
      {error && !removing && !confirmDelete ? <Feedback error>{error}</Feedback> : null}
      <View style={{ gap: 4 }}>
        <Button label={archived ? 'Restore debt' : 'Archive debt'} icon={archived ? 'restore' : 'archive'} variant="quiet" disabled={disabled}
          onPress={() => { void run(() => service!.repository.setDebtArchived(debt.id, !archived), () => setMessage(archived ? 'Debt restored.' : 'Debt archived.')); }} />
        {debt.hasWalletMoves ? <AppText size={12} tone="secondary" style={{ textAlign: 'center' }}>This debt has wallet history, so it can be archived but not deleted.</AppText>
          : <Button label="Delete debt" icon="delete" variant="quiet" danger disabled={disabled} onPress={() => { setError(null); setConfirmDelete(true); }} />}
      </View>
    </View>
    {removing ? <AppModal title="Remove this entry?" visible onClose={() => { if (!busy) setRemoving(null); }}>
      <AppText size={14} tone="secondary">{removing.walletName ? `${removing.walletName} is adjusted back by ${formatMoney(Math.abs(removing.amountMinor))}.` : 'This was a record only, so no wallet changes.'}</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Remove entry" busy={busy} disabled={Boolean(storageError)} onPress={() => { void run(() => service!.repository.deleteDebtEntry(removing.id), () => setRemoving(null)); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setRemoving(null)} />
    </AppModal> : null}
    {confirmDelete ? <AppModal title="Delete this debt?" visible onClose={() => { if (!busy) setConfirmDelete(false); }}>
      <AppText size={14} tone="secondary">The debt and its records will be removed. This can&apos;t be undone.</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} disabled={Boolean(storageError)} onPress={() => { void run(() => service!.repository.deleteDebt(debt.id), () => router.replace('/debts')); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirmDelete(false)} />
    </AppModal> : null}
  </ScrollView>;
}

export function DebtScreen() {
  const { id, saved } = useLocalSearchParams<{ id?: string; saved?: string }>();
  const { overview } = useTracker();
  if (!overview) return null;
  const debt = overview.debts.find(item => item.id === id);
  if (!debt) return <View style={{ padding: 24, gap: 16 }}><AppText>This debt is no longer available.</AppText><Button label="Open Debts" onPress={() => router.replace('/debts')} /></View>;
  return <DebtPage key={debt.id} debt={debt} saved={saved} />;
}

function DebtEditor({ debt }: { debt?: Debt }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const today = eventTime().localDate;
  const [name, setName] = useState(debt?.name ?? '');
  const [direction, setDirection] = useState<DebtDirection>(debt?.direction ?? 'owe');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState<string | null>(overview?.wallets[0]?.id ?? null);
  const [localDate, setLocalDate] = useState(today);
  const [hasDue, setHasDue] = useState(Boolean(debt?.dueDate));
  const [dueDate, setDueDate] = useState(debt?.dueDate ?? addDays(today, 30));
  const [note, setNote] = useState(debt?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: DebtCommand } | null>(null);
  const leave = (saved?: string, id = debt?.id) => id ? router.replace({ pathname: '/debt', params: saved ? { id, saved } : { id } }) : router.replace('/debts');
  useBack(() => { if (!busy) leave(); });
  async function save() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { id: debt?.id, name, direction, dueDate: hasDue ? dueDate : null, note, ...(debt ? {} : { amount, walletId, localDate }) };
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, command: service.prepareDebt(values) };
      await service.repository.saveDebt(pending.current.command);
      await refresh();
      leave('debt', pending.current.command.id);
    } catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this debt. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const owe = direction === 'owe';
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button label={debt ? 'Back to debt' : 'Back to Debts'} icon="back" iconOnly variant="quiet" disabled={busy} onPress={() => leave()} />
          <AppText accessibilityRole="header" size={24} weight="600">{debt ? 'Edit debt' : 'New debt'}</AppText>
        </View>
        <Surface style={{ gap: 18 }}>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
            {(['owe', 'owed'] as const).map(value => <View key={value} style={{ flex: 1 }}>
              <Chip label={directionLabels[value]} selected={direction === value} disabled={busy || Boolean(debt?.hasWalletMoves)} onPress={() => setDirection(value)} />
            </View>)}
          </View>
          <FormField label={owe ? 'Who do you owe?' : 'Who owes you?'} placeholder="Name" value={name} onChangeText={setName} maxLength={60} editable={!busy} />
          {!debt ? <>
            <FormField label="Amount (PHP)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
            <WalletChoice label={owe ? 'Money came into' : 'Money left from'} walletId={walletId} onChange={setWalletId} disabled={busy} />
            <DateField label="Date" value={localDate} onChange={setLocalDate} max={today} disabled={busy} />
          </> : null}
          <View style={{ gap: 10 }}>
            <AppText size={14} weight="500">Due date</AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="No due date" selected={!hasDue} disabled={busy} onPress={() => setHasDue(false)} />
              <Chip label="By a date" selected={hasDue} disabled={busy} onPress={() => setHasDue(true)} />
            </View>
            {hasDue ? <DateField label="Due" value={dueDate} onChange={setDueDate} disabled={busy} /> : null}
          </View>
          <FormField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} multiline editable={!busy} style={{ minHeight: 72, textAlignVertical: 'top' }} />
          {error ? <Feedback error>{error}</Feedback> : null}
          <Button label="Save debt" icon="check" busy={busy} disabled={Boolean(storageError)} onPress={() => { void save(); }} />
          <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => leave()} />
        </Surface>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function DebtEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { overview } = useTracker();
  if (!overview) return null;
  const debt = id ? overview.debts.find(item => item.id === id) : undefined;
  if (id && !debt) return <View style={{ padding: 24, gap: 16 }}><AppText>This debt is no longer available.</AppText><Button label="Open Debts" onPress={() => router.replace('/debts')} /></View>;
  return <DebtEditor key={debt?.id ?? 'new'} debt={debt} />;
}
