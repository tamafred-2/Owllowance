import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { WalletBadge } from '../../../components/wallet-card';
import { AppText, Button, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { walletLabel } from '../../../design-system/wallet-appearance';
import type { ContributionCommand, Goal, GoalContribution } from '../../../domain/ledger';
import { displayDate, eventTime } from '../../../domain/date';
import { formatMoney, ValidationError } from '../../../domain/money';
import { removeGoalImage } from '../../../platform/images';
import { GoalBadge, GoalProgress } from './goals-section';
import { usePullToRefresh } from './pull-to-refresh';
import { SavedFeedback } from './saved-feedback';
import { useTracker } from './tracker-context';

// Moves money between a wallet and the goal. A retry of the same values reuses the same request.
function MoveMoney({ goal, takeOut, onDone, onCancel }: { goal: Goal; takeOut: boolean; onDone: (message: string) => void; onCancel: () => void }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors } = useTheme();
  const today = eventTime().localDate;
  const wallets = overview?.wallets ?? [];
  const allWallets = [...wallets, ...(overview?.archivedWallets ?? [])];
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [localDate, setLocalDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<{ fingerprint: string; command: ContributionCommand } | null>(null);
  const wallet = wallets.find(item => item.id === walletId);
  async function submit() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const values = { goalId: goal.id, walletId, amount, takeOut, localDate, note };
      const fingerprint = JSON.stringify(values);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, command: service.prepareContribution(values) };
      const moved = Math.abs(pending.current.command.amountMinor);
      await service.repository.addContribution(pending.current.command);
      pending.current = null;
      await refresh();
      onDone(takeOut ? `${formatMoney(moved)} moved to ${wallet?.name ?? 'your wallet'}.` : `${formatMoney(moved)} moved from ${wallet?.name ?? 'your wallet'}.`);
    } catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not move the money. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!wallets.length) return <View style={{ gap: 12 }}><AppText size={14} tone="secondary">Add a wallet first.</AppText><Button label="Back" variant="quiet" onPress={onCancel} /></View>;
  return <View testID="goal-move" style={{ gap: 14 }}>
    <AppText size={16} weight="600">{takeOut ? 'Take out to a wallet' : 'Add money from a wallet'}</AppText>
    <View style={{ gap: 10 }}>
      <AppText size={14} weight="500">{takeOut ? 'Put it in' : 'Take it from'}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {wallets.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`Wallet: ${walletLabel(item, allWallets)}`}
          accessibilityState={{ checked: walletId === item.id, disabled: busy }} aria-checked={walletId === item.id} disabled={busy} onPress={() => setWalletId(item.id)}
          style={{ width: '48.5%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderRadius: 16,
            borderColor: walletId === item.id ? colors.accent : colors.border, backgroundColor: walletId === item.id ? colors.muted : colors.surface }}>
          <WalletBadge name={item.name} kind={item.kind} /><AppText size={14} numberOfLines={2} style={{ flex: 1 }}>{walletLabel(item, allWallets)}</AppText>
          {walletId === item.id ? <View style={{ position: 'absolute', top: 5, right: 5 }}><AppIcon name="check" size={13} color={colors.accent} /></View> : null}
        </Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AppText size={12} tone="secondary">{takeOut ? 'In this goal' : 'Current balance'}</AppText>
        {takeOut ? <MoneyText value={goal.savedMinor} size={14} />
          : wallet ? <MoneyText value={wallet.balanceMinor} size={14} hidden={overview?.settings.hiddenBalances.includes(wallet.id)} /> : null}
      </View>
    </View>
    <FormField label="Amount (PHP)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
    <DateField label="Date" value={localDate} onChange={setLocalDate} max={today} disabled={busy} />
    <FormField label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} editable={!busy} placeholder={takeOut ? 'Why take it out?' : 'Allowance savings, bonus…'} />
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label={takeOut ? 'Take out' : 'Add to goal'} icon="check" busy={busy} disabled={Boolean(storageError) || !walletId} onPress={() => { void submit(); }} />
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={onCancel} />
  </View>;
}

function GoalPage({ goal, saved }: { goal: Goal; saved?: string }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors } = useTheme();
  const refreshControl = usePullToRefresh();
  const [history, setHistory] = useState<GoalContribution[]>([]);
  const [mode, setMode] = useState<'view' | 'add' | 'take'>('view');
  const [message, setMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<GoalContribution | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.goalContributions(goal.id).then(rows => { if (live) setHistory(rows); }, () => undefined);
    return () => { live = false; };
  }, [service, goal.id, overview]);
  const backRef = useRef(() => {});
  useEffect(() => { backRef.current = () => { if (mode !== 'view') setMode('view'); else router.replace({ pathname: '/plan', params: { tab: 'goals' } }); }; });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { backRef.current(); return true; });
    return () => subscription.remove();
  }, []);
  async function run(work: () => Promise<void>, after: () => void) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); await refresh(); after(); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not update this goal. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const archived = Boolean(goal.archivedAt);
  const disabled = Boolean(storageError) || busy;
  const showPhoto = goal.imageUri && goal.imageUri !== brokenUri;
  return <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Back to Plan" icon="back" iconOnly variant="quiet" onPress={() => router.replace({ pathname: '/plan', params: { tab: 'goals' } })} />
        <Button label="Edit goal" icon="edit" iconOnly variant="quiet" disabled={disabled} onPress={() => router.replace({ pathname: '/goal-edit', params: { id: goal.id } })} />
      </View>
      {showPhoto ? <Image testID="goal-cover" source={{ uri: goal.imageUri! }} accessibilityIgnoresInvertColors onError={() => setBrokenUri(goal.imageUri)}
        style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: colors.muted }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {showPhoto ? null : <GoalBadge goal={goal} size={48} />}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText accessibilityRole="header" size={26} weight="600">{goal.name}</AppText>
          {archived ? <AppText size={12} tone="secondary">Archived</AppText> : null}
        </View>
      </View>
      {goal.description ? <AppText size={15} tone="secondary">{goal.description}</AppText> : null}
      <SavedFeedback saved={saved} />
      {message ? <Feedback>{message}</Feedback> : null}
      <Surface style={{ gap: 16 }}>
        <View style={{ gap: 4 }}><AppText size={14} tone="secondary">Saved</AppText><MoneyText value={goal.savedMinor} size={32} fit /></View>
        <GoalProgress goal={goal} />
        {mode !== 'view' ? <MoveMoney goal={goal} takeOut={mode === 'take'} onCancel={() => setMode('view')} onDone={text => { setMode('view'); setMessage(text); }} />
          : <View style={{ flexDirection: 'row', gap: 8 }}>
            {!archived ? <View style={{ flex: 1 }}><Button label="Add money" icon="income" disabled={disabled} onPress={() => { setMessage(null); setMode('add'); }} /></View> : null}
            <View style={{ flex: 1 }}><Button label="Take out" icon="expense" variant="secondary" disabled={disabled || goal.savedMinor <= 0} onPress={() => { setMessage(null); setMode('take'); }} /></View>
          </View>}
        <AppText size={12} tone="secondary">Money in a goal leaves your wallet but still counts in your net worth. It is not spending.</AppText>
      </Surface>
      <Surface style={{ gap: 4 }}>
        <AppText accessibilityRole="header" size={18} weight="600">History</AppText>
        {history.length ? <View testID="goal-history">
          {history.map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={14} weight="500">{row.walletName ? (row.amountMinor > 0 ? `From ${row.walletName}` : `To ${row.walletName}`) : row.amountMinor > 0 ? 'Recorded' : 'Taken out'}</AppText>
              <AppText size={12} tone="secondary">{displayDate(row.localDate)}{row.note ? ` · ${row.note}` : ''}</AppText>
            </View>
            {row.amountMinor > 0 ? <AppText size={15} tone="success">+</AppText> : null}
            <MoneyText value={row.amountMinor} size={15} style={row.amountMinor > 0 ? { color: colors.success } : undefined} />
            <Button label={`Remove ${displayDate(row.localDate)} entry`} icon="close" iconOnly variant="quiet" disabled={disabled} onPress={() => { setError(null); setRemoving(row); }} />
          </View>)}
        </View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 8 }}>Nothing saved yet. Add money from a wallet to get started.</AppText>}
      </Surface>
      {error && !removing && !confirmDelete ? <Feedback error>{error}</Feedback> : null}
      <View style={{ gap: 4 }}>
        <Button label={archived ? 'Restore goal' : 'Archive goal'} icon={archived ? 'restore' : 'archive'} variant="quiet" disabled={disabled}
          onPress={() => { void run(() => service!.repository.setGoalArchived(goal.id, !archived), () => setMessage(archived ? 'Goal restored.' : 'Goal archived.')); }} />
        {goal.hasWalletMoves ? <AppText size={12} tone="secondary" style={{ textAlign: 'center' }}>This goal has wallet history, so it can be archived but not deleted.</AppText>
          : <Button label="Delete goal" icon="delete" variant="quiet" danger disabled={disabled} onPress={() => { setError(null); setConfirmDelete(true); }} />}
      </View>
    </View>
    {removing ? <AppModal title="Remove this entry?" visible onClose={() => { if (!busy) setRemoving(null); }}>
      <AppText size={14} tone="secondary">{removing.walletName
        ? `${formatMoney(Math.abs(removing.amountMinor))} goes back ${removing.amountMinor > 0 ? `to ${removing.walletName}` : `from ${removing.walletName} into this goal`}.`
        : 'This amount was only a record, so no wallet changes.'}</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Remove entry" busy={busy} disabled={Boolean(storageError)} onPress={() => { void run(() => service!.repository.deleteContribution(removing.id), () => setRemoving(null)); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setRemoving(null)} />
    </AppModal> : null}
    {confirmDelete ? <AppModal title="Delete this goal?" visible onClose={() => { if (!busy) setConfirmDelete(false); }}>
      <AppText size={14} tone="secondary">The goal and its photo will be removed. This can&apos;t be undone.</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} disabled={Boolean(storageError)} onPress={() => {
        void run(() => service!.repository.deleteGoal(goal.id), () => { removeGoalImage(goal.imageUri); router.replace({ pathname: '/plan', params: { tab: 'goals' } }); });
      }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirmDelete(false)} />
    </AppModal> : null}
  </ScrollView>;
}

export function GoalScreen() {
  const { id, saved } = useLocalSearchParams<{ id?: string; saved?: string }>();
  const { overview } = useTracker();
  if (!overview) return null;
  const goal = overview.goals.find(item => item.id === id);
  if (!goal) return <View style={{ padding: 24, gap: 16 }}><AppText>This goal is no longer available.</AppText><Button label="Open Plan" onPress={() => router.replace({ pathname: '/plan', params: { tab: 'goals' } })} /></View>;
  return <GoalPage key={goal.id} goal={goal} saved={saved} />;
}
