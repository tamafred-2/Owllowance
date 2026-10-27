import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { HeaderActions } from '../../../components/header-actions';
import { AppModal } from '../../../components/app-modal';
import { DateField } from '../../../components/date-field';
import { AppText, Button, Chip, Feedback, FormField, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Budget, BudgetPeriod } from '../../../domain/ledger';
import { addDays, displayDate, eventTime } from '../../../domain/date';
import { ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';
import { RecurringSection } from './recurring-section';
import { GoalsSection } from './goals-section';
import { usePullToRefresh } from './pull-to-refresh';

const periodLabels: Record<BudgetPeriod, string> = { monthly: 'Monthly', weekly: 'Weekly', custom: 'Custom dates' };

export function BudgetProgress({ budget, onPress }: { budget: Budget; onPress?: () => void }) {
  const { colors, isDark } = useTheme();
  const tint = categoryColors(budget.colorToken, isDark);
  const ratio = budget.spentMinor / budget.limitMinor;
  const over = budget.spentMinor > budget.limitMinor;
  const remaining = budget.limitMinor - budget.spentMinor;
  const range = `${displayDate(budget.windowStart)} – ${displayDate(addDays(budget.windowEnd, -1))}`;
  const body = <View style={{ gap: 10, paddingVertical: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ padding: 8, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={budget.iconKey as IconName} size={18} color={tint.foreground} /></View>
      <View style={{ flex: 1 }}><AppText size={15} weight="600">{budget.categoryName}</AppText><AppText size={12} tone="secondary">{`${periodLabels[budget.period]} · ${range}`}</AppText></View>
    </View>
    <View accessible={false} aria-hidden style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ height: 8, borderRadius: 4, width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: over ? colors.error : tint.foreground }} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MoneyText value={budget.spentMinor} size={13} /><AppText size={13} tone="secondary">of</AppText><MoneyText value={budget.limitMinor} size={13} /></View>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <MoneyText value={Math.abs(remaining)} size={13} style={over ? { color: colors.error } : undefined} />
        <AppText size={13} tone={over ? 'error' : 'secondary'}>{over ? 'over' : 'left'}</AppText>
      </View>
    </View>
  </View>;
  if (!onPress) return body;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${budget.categoryName} budget`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{body}</Pressable>;
}

function BudgetForm({ budget, onClose }: { budget?: Budget; onClose: () => void }) {
  const { service, overview, refresh, error: storageError } = useTracker();
  const today = eventTime().localDate;
  const taken = new Set((overview?.budgets ?? []).filter(item => item.id !== budget?.id).map(item => item.categoryId));
  const categories = (overview?.categories ?? []).filter(category => !taken.has(category.id) || category.id === budget?.categoryId);
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? categories[0]?.id ?? '');
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'monthly');
  const [limit, setLimit] = useState(budget ? (budget.limitMinor / 100).toFixed(2) : '');
  const [startDate, setStartDate] = useState(budget?.startDate ?? today);
  const [endDate, setEndDate] = useState(budget?.endDate ? addDays(budget.endDate, -1) : addDays(today, 13));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function run(work: () => Promise<void>) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); await refresh(); onClose(); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this budget. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const save = () => run(async () => { await service!.repository.saveBudget(service!.prepareBudget({ id: budget?.id, categoryId, period, limit, startDate, endDate })); });
  return <AppModal title={confirmDelete ? 'Delete this budget?' : budget ? 'Edit budget' : 'New budget'} visible onClose={() => { if (!busy) onClose(); }}>
    {confirmDelete ? <>
      <AppText size={14} tone="secondary">Your transactions stay as they are. Only the limit is removed.</AppText>
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Confirm delete" busy={busy} onPress={() => { void run(async () => { await service!.repository.deleteBudget(budget!.id); }); }} />
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setConfirmDelete(false)} />
    </> : <>
      <AppText size={14} weight="500">Category</AppText>
      {categories.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {categories.map(category => <Chip key={category.id} label={category.name} icon={category.iconKey as IconName} selected={categoryId === category.id} disabled={busy} onPress={() => setCategoryId(category.id)} />)}
      </View> : <AppText size={14} tone="secondary">Every expense category already has a budget.</AppText>}
      <AppText size={14} weight="500">Period</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['monthly', 'weekly', 'custom'] as const).map(value => <Chip key={value} label={periodLabels[value]} selected={period === value} disabled={busy} onPress={() => setPeriod(value)} />)}
      </View>
      {period === 'custom' ? <View style={{ gap: 12 }}>
        <DateField label="Start date" value={startDate} onChange={setStartDate} disabled={busy} />
        <DateField label="End date" value={endDate} onChange={setEndDate} disabled={busy} />
      </View> : <AppText size={12} tone="secondary">{period === 'weekly' ? 'Resets every Monday.' : 'Resets on the 1st of each month.'} Unused amounts don&apos;t roll over.</AppText>}
      <FormField label="Limit (PHP)" placeholder="0.00" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" editable={!busy} />
      {error ? <Feedback error>{error}</Feedback> : null}
      <Button label="Save budget" busy={busy} disabled={Boolean(storageError) || !categoryId} onPress={() => { void save(); }} />
      {budget ? <Button label="Delete budget" icon="delete" variant="quiet" disabled={busy} onPress={() => setConfirmDelete(true)} /> : null}
      <Button label="Cancel" variant="quiet" disabled={busy} onPress={onClose} />
    </>}
  </AppModal>;
}

export type PlanTab = 'budgets' | 'recurring' | 'goals';
const planTabs: { key: PlanTab; label: string; icon: IconName }[] = [
  { key: 'budgets', label: 'Budgets', icon: 'budgets' }, { key: 'recurring', label: 'Recurring', icon: 'bills' }, { key: 'goals', label: 'Goals', icon: 'goals' },
];
// The tab last viewed this session, so the Plan tab in the navigation returns to it.
let lastPlanTab: PlanTab = 'budgets';

function PlanTabs({ tab, onChange }: { tab: PlanTab; onChange: (tab: PlanTab) => void }) {
  const { colors } = useTheme();
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.muted }}>
    {planTabs.map(item => {
      const selected = tab === item.key;
      return <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} aria-selected={selected} onPress={() => onChange(item.key)}
        style={{ flex: 1, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 10, backgroundColor: selected ? colors.accent : 'transparent' }}>
        <AppIcon name={item.icon} size={16} color={selected ? colors.onAccent : colors.textSecondary} />
        <AppText size={13} weight="600" numberOfLines={1} style={{ color: selected ? colors.onAccent : colors.textSecondary }}>{item.label}</AppText>
      </Pressable>;
    })}
  </View>;
}

function BudgetsSection() {
  const { overview, error } = useTracker();
  const { colors } = useTheme();
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const budgets = overview?.budgets ?? [];
  const canAdd = Boolean(overview?.categories.length) && !error && budgets.length < (overview?.categories.length ?? 0);
  return <Surface style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <AppText accessibilityRole="header" size={20} weight="600">Budgets</AppText>
      {canAdd ? <Button label="Add budget" variant="quiet" onPress={() => setEditing('new')} /> : null}
    </View>
    {budgets.length ? <View testID="budget-list">{budgets.map((budget, index) => <View key={budget.id} style={{ borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
      <BudgetProgress budget={budget} onPress={() => setEditing(budget)} />
    </View>)}</View> : <View style={{ gap: 8, paddingVertical: 12 }}>
      <AppText size={14} tone="secondary">Set a spending limit for a category. Only posted expenses count; transfers don&apos;t.</AppText>
      {canAdd ? <Button label="Create your first budget" icon="budgets" variant="secondary" onPress={() => setEditing('new')} /> : null}
    </View>}
    {editing ? <BudgetForm budget={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
  </Surface>;
}

// Plan: budgets, recurring bills and goals, one tab at a time (?tab= opens a specific one).
export function PlanScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested = planTabs.find(item => item.key === params.tab)?.key;
  const [chosen, setChosen] = useState<PlanTab>(lastPlanTab);
  const tab = requested ?? chosen;
  useEffect(() => { lastPlanTab = tab; }, [tab]);
  const refreshControl = usePullToRefresh();
  return <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: width >= 900 ? 40 : 20 }}>
    <View style={{ width: '100%', maxWidth: 1050, alignSelf: 'center', gap: 20 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><AppText accessibilityRole="header" size={28} weight="700" style={{ flexShrink: 1 }}>Plan</AppText><HeaderActions /></View>
        <AppText size={14} tone="secondary">Make space for what&apos;s next.</AppText>
      </View>
      <PlanTabs tab={tab} onChange={next => { setChosen(next); router.setParams({ tab: next }); }} />
      {tab === 'budgets' ? <BudgetsSection /> : tab === 'recurring' ? <RecurringSection /> : <GoalsSection />}
    </View>
  </ScrollView>;
}
