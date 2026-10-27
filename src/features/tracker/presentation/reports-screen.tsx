import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { AppText, Button, Feedback, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Report } from '../../../domain/ledger';
import { addDays, eventTime, monthStart, nextMonthStart } from '../../../domain/date';
import { useTracker } from './tracker-context';

const monthName = (localDate: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${localDate}T12:00:00Z`));

// Posted income and expenses for one calendar month; transfers and opening balances are excluded.
export function ReportsScreen() {
  const { service, overview } = useTracker();
  const { colors, isDark } = useTheme();
  const current = monthStart(eventTime().localDate);
  const [month, setMonth] = useState(current);
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.report(month, nextMonthStart(month)).then(
      result => { if (live) { setReport(result); setFailed(false); } },
      () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [service, month, overview]);
  const scale = Math.max(report?.incomeMinor ?? 0, report?.expenseMinor ?? 0, 1);
  const net = (report?.incomeMinor ?? 0) - (report?.expenseMinor ?? 0);
  const topCategory = report?.byCategory[0]?.amountMinor ?? 1;
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back to Plan" icon="back" variant="quiet" onPress={() => router.replace('/plan')} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Insights</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Previous month" icon="previous" iconOnly variant="quiet" onPress={() => setMonth(monthStart(addDays(month, -1)))} />
        <AppText testID="report-month" size={18} weight="600">{monthName(month)}</AppText>
        <Button label="Next month" icon="next" iconOnly variant="quiet" disabled={month >= current} onPress={() => setMonth(nextMonthStart(month))} />
      </View>
      {failed ? <Feedback error>Could not load this report.</Feedback> : !report ? <ActivityIndicator color={colors.accent} /> : <>
        <Surface style={{ gap: 16 }}>
          <AppText size={18} weight="600">Income vs expenses</AppText>
          {([{ label: 'Income', value: report.incomeMinor, icon: 'income', color: colors.success }, { label: 'Expenses', value: report.expenseMinor, icon: 'expense', color: colors.accent }] as const).map(item => <View key={item.label} style={{ gap: 8 }}>
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
        <Surface style={{ gap: 12 }}>
          <AppText size={18} weight="600">Spending by category</AppText>
          {report.byCategory.length ? report.byCategory.map(item => {
            const tint = categoryColors(item.colorToken, isDark);
            const share = report.expenseMinor ? Math.round(item.amountMinor / report.expenseMinor * 100) : 0;
            return <View key={item.categoryId} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ padding: 6, borderRadius: 8, backgroundColor: tint.background }}><AppIcon name={item.iconKey as IconName} size={16} color={tint.foreground} /></View>
                <AppText size={14} style={{ flex: 1 }}>{item.name}</AppText>
                <AppText size={12} tone="secondary">{`${share}%`}</AppText>
                <MoneyText value={item.amountMinor} size={14} />
              </View>
              <View accessible={false} aria-hidden style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}><View style={{ height: 6, borderRadius: 3, width: `${item.amountMinor / topCategory * 100}%`, backgroundColor: tint.foreground }} /></View>
            </View>;
          }) : <AppText size={14} tone="secondary">No expenses this month.</AppText>}
        </Surface>
        <AppText size={12} tone="secondary">Transfers between your wallets and opening balances are not counted.</AppText>
      </>}
    </View>
  </ScrollView>;
}
