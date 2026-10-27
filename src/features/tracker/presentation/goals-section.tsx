import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { AppText, Button, Chip, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Goal, GoalContribution } from '../../../domain/ledger';
import { addDays, displayDate, eventTime } from '../../../domain/date';
import { formatMoney, ValidationError } from '../../../domain/money';
import { categoryColorTokens } from '../../../domain/category';
import { monthlyNeeded } from '../../../domain/goals';
import { useTracker } from './tracker-context';

const goalIcons = ['savings', 'phone', 'travel', 'home', 'education', 'gift', 'family', 'entertainment', 'pets', 'beauty', 'shopping', 'other'] as const;

function GoalProgress({ goal }: { goal: Goal }) {
  const { colors, isDark } = useTheme();
  const tint = categoryColors(goal.colorToken, isDark);
  const ratio = Math.min(goal.savedMinor / goal.targetMinor, 1);
  const reached = goal.savedMinor >= goal.targetMinor;
  const perMonth = monthlyNeeded(goal.savedMinor, goal.targetMinor, goal.targetDate, eventTime().localDate);
  return <View style={{ gap: 8 }}>
    <View accessible={false} aria-hidden style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ height: 8, borderRadius: 4, width: `${Math.max(ratio * 100, ratio ? 2 : 0)}%`, backgroundColor: reached ? colors.success : tint.foreground }} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MoneyText value={goal.savedMinor} size={13} /><AppText size={13} tone="secondary">of</AppText><MoneyText value={goal.targetMinor} size={13} /></View>
      <AppText size={12} tone={reached ? 'success' : 'secondary'}>{reached ? 'Reached' : perMonth ? `${formatMoney(perMonth)}/month to reach by ${displayDate(goal.targetDate!)}` : goal.targetDate ? `Target ${displayDate(goal.targetDate)}` : `${Math.round(ratio * 100)}%`}</AppText>
    </View>
  </View>;
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: (changed: boolean) => void }) {
  const { service, error: storageError } = useTracker();
  const { colors, isDark } = useTheme();
  const today = eventTime().localDate;
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? (goal.targetMinor / 100).toFixed(2) : '');
  const [hasDate, setHasDate] = useState(Boolean(goal?.targetDate));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? addDays(today, 90));
  const [iconKey, setIconKey] = useState(goal?.iconKey ?? 'savings');
  const [colorToken, setColorToken] = useState(goal?.colorToken ?? 'teal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function save() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await service.repository.saveGoal(service.prepareGoal({ id: goal?.id, name, target, targetDate: hasDate ? targetDate : null, iconKey, colorToken })); onClose(true); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this goal. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <AppModal title={goal ? 'Edit goal' : 'New goal'} visible onClose={() => { if (!busy) onClose(false); }}>
    <FormField label="Goal name" placeholder="New phone, Emergency fund…" value={name} onChangeText={setName} maxLength={60} editable={!busy} />
    <FormField label="Target (PHP)" placeholder="0.00" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={!busy} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Chip label="No deadline" selected={!hasDate} disabled={busy} onPress={() => setHasDate(false)} />
      <Chip label="By a date" selected={hasDate} disabled={busy} onPress={() => setHasDate(true)} />
    </View>
    {hasDate ? <DateField label="Target date" value={targetDate} onChange={setTargetDate} disabled={busy} /> : null}
    <AppText size={14} weight="500">Icon</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {goalIcons.map(key => <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`Icon ${key}`} accessibilityState={{ checked: iconKey === key }} disabled={busy} onPress={() => setIconKey(key)}
        style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: iconKey === key ? colors.accent : colors.border, backgroundColor: iconKey === key ? colors.muted : colors.surface }}>
        <AppIcon name={key as IconName} size={20} color={iconKey === key ? colors.accent : colors.textSecondary} />
      </Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {categoryColorTokens.map(token => {
        const swatch = categoryColors(token, isDark);
        return <Pressable key={token} accessibilityRole="radio" accessibilityLabel={`Color ${token}`} accessibilityState={{ checked: colorToken === token }} disabled={busy} onPress={() => setColorToken(token)}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: swatch.background, borderWidth: 2, borderColor: colorToken === token ? colors.accent : 'transparent' }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: swatch.foreground }} />
        </Pressable>;
      })}
    </View>
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label="Save goal" busy={busy} disabled={Boolean(storageError)} onPress={() => { void save(); }} />
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => onClose(false)} />
  </AppModal>;
}

function GoalDetails({ goal, onClose, onEdit }: { goal: Goal; onClose: () => void; onEdit: () => void }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const { colors } = useTheme();
  const today = eventTime().localDate;
  const [history, setHistory] = useState<GoalContribution[]>([]);
  const [mode, setMode] = useState<'view' | 'add' | 'take' | 'delete'>('view');
  const [amount, setAmount] = useState('');
  const [localDate, setLocalDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // The live version of this goal after changes.
  const current = overview?.goals.find(item => item.id === goal.id) ?? goal;
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.goalContributions(goal.id).then(rows => { if (live) setHistory(rows); }, () => undefined);
    return () => { live = false; };
  }, [service, goal.id, overview]);
  async function run(work: () => Promise<void>, after: () => void = () => setMode('view')) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); await refresh(); after(); setAmount(''); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not update this goal. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const archived = Boolean(current.archivedAt);
  return <AppModal title={mode === 'delete' ? 'Delete this goal?' : current.name} visible onClose={() => { if (!busy) onClose(); }}>
    {mode === 'delete' ? <>
      <AppText size={14} tone="secondary">Its saved amounts are only a record, so your wallets are not affected.</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} onPress={() => { void run(() => service!.repository.deleteGoal(goal.id), onClose); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setMode('view')} />
    </> : <>
      <GoalProgress goal={current} />
      {mode === 'add' || mode === 'take' ? <View style={{ gap: 12 }}>
        <FormField label={mode === 'add' ? 'Amount to add (PHP)' : 'Amount to take out (PHP)'} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} autoFocus />
        <DateField label="Date" value={localDate} onChange={setLocalDate} max={today} disabled={busy} />
        {error ? <Feedback error>{error}</Feedback> : null}
        <Button label={mode === 'add' ? 'Add to goal' : 'Take out'} busy={busy} disabled={Boolean(storageError)}
          onPress={() => { void run(() => service!.repository.addContribution(service!.prepareContribution({ goalId: goal.id, amount, takeOut: mode === 'take', localDate, note: '' }))); }} />
        <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => { setMode('view'); setError(null); }} />
      </View> : <>
        {!archived ? <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="Add money" icon="income" onPress={() => setMode('add')} /></View>
          <View style={{ flex: 1 }}><Button label="Take out" variant="secondary" disabled={current.savedMinor <= 0} onPress={() => setMode('take')} /></View>
        </View> : null}
        <AppText size={12} tone="secondary">Saving toward a goal is a record of money set aside; it doesn&apos;t move money between wallets.</AppText>
        {history.length ? <View testID="goal-history">
          {history.slice(0, 8).map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
            <AppText size={13} tone="secondary" style={{ flex: 1 }}>{displayDate(row.localDate)}</AppText>
            <MoneyText value={row.amountMinor} size={14} style={row.amountMinor > 0 ? { color: colors.success } : undefined} />
            <Button label={`Remove ${displayDate(row.localDate)} entry`} icon="close" iconOnly variant="quiet" disabled={busy} onPress={() => { void run(() => service!.repository.deleteContribution(row.id), () => undefined); }} />
          </View>)}
        </View> : null}
        {error ? <Feedback error>{error}</Feedback> : null}
        <Button label="Edit goal" icon="edit" variant="quiet" disabled={busy} onPress={onEdit} />
        <Button label={archived ? 'Restore goal' : 'Archive goal'} icon={archived ? 'restore' : 'archive'} variant="quiet" disabled={busy}
          onPress={() => { void run(() => service!.repository.setGoalArchived(goal.id, !archived), () => undefined); }} />
        <Button label="Delete goal" icon="delete" variant="quiet" danger disabled={busy} onPress={() => setMode('delete')} />
        <Button label="Close" variant="quiet" disabled={busy} onPress={onClose} />
      </>}
    </>}
  </AppModal>;
}

// Plan: savings goals with progress; tap one to add money, see its history or edit it.
export function GoalsSection() {
  const { overview, refresh } = useTracker();
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<Goal | null>(null);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const goals = overview?.goals ?? [];
  return <Surface style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <AppText accessibilityRole="header" size={20} weight="600">Goals</AppText>
      <Button label="Add goal" variant="quiet" onPress={() => setEditing('new')} />
    </View>
    {goals.length ? <View testID="goal-list">{goals.map((goal, index) => {
      const tint = categoryColors(goal.colorToken, isDark);
      return <Pressable key={goal.id} accessibilityRole="button" accessibilityLabel={`Open goal ${goal.name}`} onPress={() => setSelected(goal)}
        style={({ pressed }) => ({ gap: 10, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderColor: colors.border, opacity: pressed ? 0.7 : goal.archivedAt ? 0.6 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ padding: 8, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={goal.iconKey as IconName} size={18} color={tint.foreground} /></View>
          <AppText size={15} weight="600" style={{ flex: 1 }} numberOfLines={1}>{goal.name}</AppText>
          {goal.archivedAt ? <AppText size={12} tone="secondary">Archived</AppText> : null}
        </View>
        <GoalProgress goal={goal} />
      </Pressable>;
    })}</View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 10 }}>Save toward something: a new phone, a trip or an emergency fund.</AppText>}
    {selected ? <GoalDetails goal={selected} onClose={() => setSelected(null)} onEdit={() => { setEditing(selected); setSelected(null); }} /> : null}
    {editing ? <GoalForm goal={editing === 'new' ? undefined : editing} onClose={changed => { setEditing(null); if (changed) void refresh(); }} /> : null}
  </Surface>;
}
