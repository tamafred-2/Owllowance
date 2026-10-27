import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { AppText, Button, Chip, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { CategoryType, RecurringRule } from '../../../domain/ledger';
import { eventTime } from '../../../domain/date';
import { ValidationError } from '../../../domain/money';
import { describeSchedule, isoWeekday, type Frequency } from '../../../domain/recurring';
import { useTracker } from './tracker-context';
import { dueLabel } from './payments-due';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function RecurringForm({ rule, onClose }: { rule?: RecurringRule; onClose: (changed: boolean) => void }) {
  const { service, overview, error: storageError } = useTracker();
  const today = eventTime().localDate;
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<CategoryType>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule ? (rule.amountMinor / 100).toFixed(2) : '');
  const [walletId, setWalletId] = useState(rule?.walletId ?? overview?.wallet?.id ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [every, setEvery] = useState(String(rule?.every ?? Number(today.slice(8))));
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const categories = type === 'expense' ? overview?.categories ?? [] : overview?.incomeCategories ?? [];
  const wallets = overview?.wallets ?? [];
  async function run(work: () => Promise<void>) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); onClose(true); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const pickFrequency = (value: Frequency) => {
    setFrequency(value);
    setEvery(String(value === 'monthly' ? Number(startDate.slice(8)) : value === 'weekly' ? isoWeekday(startDate) : 7));
  };
  return <AppModal title={confirmDelete ? 'Delete this recurring item?' : rule ? 'Edit recurring' : 'New recurring'} visible onClose={() => { if (!busy) onClose(false); }}>
    {confirmDelete ? <>
      <AppText size={14} tone="secondary">Past payments stay in your history. It will stop appearing in Payments due.</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} onPress={() => { void run(() => service!.repository.deleteRecurring(rule!.id)); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirmDelete(false)} />
    </> : <>
      <FormField label="Name" placeholder="Rent, Internet, Allowance…" value={name} onChangeText={setName} maxLength={60} editable={!busy} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Expense" selected={type === 'expense'} disabled={busy} onPress={() => { setType('expense'); setCategoryId(''); }} />
        <Chip label="Income" selected={type === 'income'} disabled={busy} onPress={() => { setType('income'); setCategoryId(''); }} />
      </View>
      <FormField label="Amount (PHP)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />
      <AppText size={14} weight="500">Wallet</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {wallets.map(wallet => <Chip key={wallet.id} label={wallet.name} selected={walletId === wallet.id} disabled={busy} onPress={() => setWalletId(wallet.id)} />)}
      </View>
      <AppText size={14} weight="500">Category</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map(category => <Chip key={category.id} label={category.name} icon={category.iconKey as IconName} selected={categoryId === category.id} disabled={busy} onPress={() => setCategoryId(category.id)} />)}
      </View>
      <AppText size={14} weight="500">Repeats</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['monthly', 'Monthly'], ['weekly', 'Weekly'], ['days', 'Every few days']] as const).map(([value, label]) =>
          <Chip key={value} label={label} selected={frequency === value} disabled={busy} onPress={() => pickFrequency(value)} />)}
      </View>
      {frequency === 'weekly' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {weekdays.map((day, index) => <Chip key={day} label={day} selected={every === String(index + 1)} disabled={busy} onPress={() => setEvery(String(index + 1))} />)}
      </View> : <FormField label={frequency === 'monthly' ? 'Day of the month' : 'Every how many days'} value={every} onChangeText={setEvery} keyboardType="number-pad" maxLength={3} editable={!busy}
        hint={frequency === 'monthly' ? 'Days past the end of a month fall on its last day.' : undefined} />}
      <DateField label="Starting" value={startDate} onChange={setStartDate} disabled={busy} />
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Save" busy={busy} disabled={Boolean(storageError)}
        onPress={() => { void run(() => service!.repository.saveRecurring(service!.prepareRecurring({ id: rule?.id, name, type, amount, walletId, categoryId, frequency, every, startDate }))); }} />
      {rule ? <Button label={rule.paused ? 'Resume' : 'Pause'} variant="secondary" disabled={busy} onPress={() => { void run(() => service!.repository.setRecurringPaused(rule.id, !rule.paused)); }} /> : null}
      {rule ? <Button label="Delete" icon="delete" variant="quiet" danger disabled={busy} onPress={() => setConfirmDelete(true)} /> : null}
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => onClose(false)} />
    </>}
  </AppModal>;
}

// Plan: recurring bills and income; their unhandled occurrences show on Home's Payments due.
export function RecurringSection() {
  const { service, overview, refresh } = useTracker();
  const { colors, isDark } = useTheme();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);
  const today = eventTime().localDate;
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.recurring().then(result => { if (live) setRules(result); }, () => undefined);
    return () => { live = false; };
  }, [service, overview]);
  const canAdd = Boolean(overview?.wallets.length);
  return <Surface style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <AppText accessibilityRole="header" size={20} weight="600">Recurring</AppText>
      {canAdd ? <Button label="Add recurring" variant="quiet" onPress={() => setEditing('new')} /> : null}
    </View>
    {rules.length ? <View testID="recurring-list">{rules.map((rule, index) => {
      const tint = categoryColors(rule.colorToken, isDark);
      return <Pressable key={rule.id} accessibilityRole="button" accessibilityLabel={`Edit ${rule.name}`} onPress={() => setEditing(rule)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.border, opacity: pressed ? 0.7 : rule.paused ? 0.6 : 1 })}>
        <View style={{ padding: 8, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={rule.iconKey as IconName} size={18} color={tint.foreground} /></View>
        <View style={{ flex: 1 }}>
          <AppText size={15} weight="600" numberOfLines={1}>{rule.name}</AppText>
          <AppText size={12} tone="secondary">{rule.paused ? `${describeSchedule(rule)} · Paused` : `${describeSchedule(rule)}${rule.nextDue ? ` · ${dueLabel(rule.nextDue, today)}` : ''}`}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {rule.type === 'income' ? <AppText size={14} tone="success">+</AppText> : null}
          <MoneyText value={rule.amountMinor} size={14} style={rule.type === 'income' ? { color: colors.success } : undefined} />
        </View>
      </Pressable>;
    })}</View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 10 }}>Add rent, bills, subscriptions or a regular allowance. They appear on Home when due, ready to mark paid.</AppText>}
    {editing ? <RecurringForm rule={editing === 'new' ? undefined : editing} onClose={changed => { setEditing(null); if (changed) void refresh(); }} /> : null}
  </Surface>;
}
