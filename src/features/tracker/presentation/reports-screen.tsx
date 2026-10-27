import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Report } from '../../../domain/ledger';
import { addDays, eventTime, monthStart, nextMonthStart } from '../../../domain/date';
import { formatMoney } from '../../../domain/money';
import { useTracker } from './tracker-context';
import { usePullToRefresh } from './pull-to-refresh';

const monthName = (localDate: string, style: 'long' | 'short' = 'long') =>
  new Intl.DateTimeFormat('en-PH', { month: style, ...(style === 'long' ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${localDate}T12:00:00Z`));
const TOP = 5;

type Row = Report['byCategory'][number] & { previousMinor: number };

// One ranked row: identity by icon + name (never color alone), share and change spelled out.
function CategoryRow({ row, total, top, previousLabel, onPress }: { row: Row; total: number; top: number; previousLabel: string; onPress?: () => void }) {
  const { colors, isDark } = useTheme();
  const tint = categoryColors(row.colorToken, isDark);
  const share = total ? Math.round(row.amountMinor / total * 100) : 0;
  const change = row.amountMinor - row.previousMinor;
  const changeText = !row.previousMinor ? 'New this month' : change === 0 ? `Same as ${previousLabel}` : `${change > 0 ? '▲' : '▼'} ${formatMoney(Math.abs(change))} vs ${previousLabel}`;
  const body = <View style={{ gap: 8, paddingVertical: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ padding: 7, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={row.iconKey as IconName} size={16} color={tint.foreground} /></View>
      <View style={{ flex: 1 }}>
        <AppText size={14} weight="600" numberOfLines={1}>{row.name}</AppText>
        <AppText size={12} tone="secondary">{`${row.count} ${row.count === 1 ? 'transaction' : 'transactions'} · ${share}%`}</AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <MoneyText value={row.amountMinor} size={15} />
        <AppText size={11} tone="secondary">{changeText}</AppText>
      </View>
      {onPress ? <AppIcon name="next" size={16} color={colors.textSecondary} /> : null}
    </View>
    <View accessible={false} aria-hidden style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ height: 6, borderRadius: 3, width: `${Math.max(row.amountMinor / top * 100, 2)}%`, backgroundColor: tint.foreground }} />
    </View>
  </View>;
  if (!onPress) return body;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.name}: ${formatMoney(row.amountMinor)}, ${share} percent. ${changeText}. Show transactions`}
    onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{body}</Pressable>;
}

// Posted income and expenses for one calendar month; transfers and opening balances are excluded.
export function ReportsScreen() {
  const { service, overview } = useTracker();
  const { colors } = useTheme();
  const refreshControl = usePullToRefresh();
  const current = monthStart(eventTime().localDate);
  const [month, setMonth] = useState(current);
  const [report, setReport] = useState<{ month: string; now: Report; before: Report } | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const previousMonth = monthStart(addDays(month, -1));
  useEffect(() => {
    if (!service) return;
    let live = true;
    Promise.all([service.repository.report(month, nextMonthStart(month)), service.repository.report(previousMonth, month)]).then(
      ([now, before]) => { if (live) { setReport({ month, now, before }); setFailed(false); } },
      () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [service, month, previousMonth, overview]);
  const data = report?.month === month ? report : null;
  const income = data?.now.incomeMinor ?? 0, expense = data?.now.expenseMinor ?? 0;
  const scale = Math.max(income, expense, 1);
  const net = income - expense;
  const previous = new Map((data?.before.byCategory ?? []).map(item => [item.categoryId, item.amountMinor]));
  const rows: Row[] = (data?.now.byCategory ?? []).map(item => ({ ...item, previousMinor: previous.get(item.categoryId) ?? 0 }));
  // Beyond the top five, the rest fold into one "Other" row unless expanded.
  const folded = !showAll && rows.length > TOP + 1;
  const shown = folded ? rows.slice(0, TOP) : rows;
  const rest = rows.slice(TOP);
  const other: Row = { categoryId: 'other', name: `Other (${rest.length})`, iconKey: 'other', colorToken: 'slate',
    amountMinor: rest.reduce((sum, item) => sum + item.amountMinor, 0), count: rest.reduce((sum, item) => sum + item.count, 0), previousMinor: rest.reduce((sum, item) => sum + item.previousMinor, 0) };
  const top = rows[0]?.amountMinor ?? 1;
  const previousLabel = monthName(previousMonth, 'short');
  const openCategory = (categoryId: string) => router.push({ pathname: '/activity', params: { categoryId, month } });
  return <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back to Home" icon="back" iconOnly variant="quiet" onPress={() => router.replace('/')} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Insights</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Previous month" icon="previous" iconOnly variant="quiet" onPress={() => { setMonth(previousMonth); setShowAll(false); }} />
        <AppText testID="report-month" size={18} weight="600">{monthName(month)}</AppText>
        <Button label="Next month" icon="next" iconOnly variant="quiet" disabled={month >= current} onPress={() => { setMonth(nextMonthStart(month)); setShowAll(false); }} />
      </View>
      {failed ? <Feedback error>Could not load this report.</Feedback> : !data ? <ActivityIndicator color={colors.accent} /> : <>
        <Surface style={{ gap: 16 }}>
          <AppText size={18} weight="600">Income vs expenses</AppText>
          {([{ label: 'Income', value: income, icon: 'income', color: colors.success }, { label: 'Expenses', value: expense, icon: 'expense', color: colors.accent }] as const).map(item => <View key={item.label} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><AppIcon name={item.icon} size={16} color={item.color} /><AppText size={13} tone="secondary">{item.label}</AppText></View>
              <MoneyText value={item.value} size={18} />
            </View>
            <View accessible={false} aria-hidden style={{ height: 10, borderRadius: 5, backgroundColor: colors.muted, overflow: 'hidden' }}><View style={{ height: 10, borderRadius: 5, width: `${item.value / scale * 100}%`, backgroundColor: item.color }} /></View>
          </View>)}
          <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 2 }}>
            <AppText size={12} tone="secondary">{net >= 0 ? 'Saved this month' : 'Spent more than earned'}</AppText>
            <MoneyText value={net} size={24} style={net < 0 ? { color: colors.error } : undefined} />
          </View>
        </Surface>
        <Surface style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppText size={18} weight="600">Spending by category</AppText>
              {rows.length ? <AppText size={12} tone="secondary">{`Top: ${rows[0].name}. Tap a category to see its transactions.`}</AppText> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}><AppText size={11} tone="secondary">Total spent</AppText><MoneyText value={expense} size={16} /></View>
          </View>
          {rows.length ? <View testID="category-breakdown">
            {shown.map((row, index) => <View key={row.categoryId} style={{ borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
              <CategoryRow row={row} total={expense} top={top} previousLabel={previousLabel} onPress={() => openCategory(row.categoryId)} />
            </View>)}
            {folded ? <View style={{ borderTopWidth: 1, borderColor: colors.border }}><CategoryRow row={other} total={expense} top={top} previousLabel={previousLabel} /></View> : null}
            {rows.length > TOP + 1 ? <Button label={showAll ? 'Show fewer' : `Show all ${rows.length} categories`} variant="quiet" onPress={() => setShowAll(value => !value)} /> : null}
          </View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 12 }}>No expenses this month.</AppText>}
        </Surface>
        <AppText size={12} tone="secondary">Transfers between your wallets and opening balances are not counted. Transfer fees count under Fees.</AppText>
      </>}
    </View>
  </ScrollView>;
}
