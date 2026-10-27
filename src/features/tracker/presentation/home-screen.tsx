import { HeaderActions } from '../../../components/header-actions';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText, Button, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { forestSummaryColors, useTheme } from '../../../design-system/theme';
import { FloatingStreak } from '../../../components/floating-streak';
import { ForestScene } from '../../../components/forest-scene';
import { useTracker } from './tracker-context';
import { usePullToRefresh } from './pull-to-refresh';
import { useOpenSheet } from './sheet-context';
import { PaymentsDue } from './payments-due';
import { BudgetProgress } from './plan-screen';
import { SavedFeedback } from './saved-feedback';
import { WalletSetup } from './wallet-setup';

const quickActions: { label: string; icon: IconName; href?: '/transfer' | '/plan' | '/reports' }[] = [
  { label: 'Transfer', icon: 'transfer', href: '/transfer' /* opens as a sheet */ }, { label: 'Budgets', icon: 'budgets', href: '/plan' },
  { label: 'Insights', icon: 'insights', href: '/reports' }, { label: 'Goals', icon: 'goals', href: '/plan' }, { label: 'Debt', icon: 'debt' },
];

export function HomeScreen() {
  const { overview } = useTracker();
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const { width, fontScale } = useWindowDimensions();
  const { colors } = useTheme();
  const [sceneVisible, setSceneVisible] = useState(true);
  const refreshControl = usePullToRefresh();
  const openSheet = useOpenSheet();
  if (!overview) return null;
  const income = overview.todayIncomeMinor;
  const expense = overview.todaySpentMinor;
  const net = income - expense;
  const scale = Math.max(income, expense, 1);
  const greeting = new Date().getHours() < 12 ? 'Good morning.' : new Date().getHours() < 18 ? 'Good afternoon.' : 'Good evening.';
  return <View style={{ flex: 1 }}><ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} key={overview.wallet?.id ?? 'setup'} keyboardShouldPersistTaps="handled" scrollEventThrottle={100}
    onScroll={event => setSceneVisible(event.nativeEvent.contentOffset.y < 300)}
    contentContainerStyle={{ padding: width >= 900 ? 40 : 20, flexGrow: 1 }}>
    {!overview.wallet && !overview.archivedWallets.length ? <WalletSetup /> : <View style={{ maxWidth: 1050, width: '100%', alignSelf: 'center', gap: 24 }}>
      <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText accessibilityRole="header" accessibilityLabel="Home" size={width < 400 ? 23 : 28} weight="700" style={{ flex: 1 }}>{greeting}</AppText>
        <HeaderActions />
      </View>
        <AppText size={12} tone="secondary">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</AppText></View>
      <ForestScene visible={sceneVisible}>{({ night }) => {
        const palette = forestSummaryColors[night ? 'night' : 'day'];
        return <Surface style={{ padding: 14, gap: 4, backgroundColor: palette.background, borderColor: palette.border }}>
          <AppText size={16} weight="700" style={{ color: palette.text, lineHeight: 21 }}>{'A little wiser,\nevery day.'}</AppText>
          <AppText size={12} style={{ color: palette.secondary }}>Make room for what matters.</AppText>
        </Surface>;
      }}</ForestScene>
      <SavedFeedback saved={saved} />
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><AppText size={18} weight="600">Quick actions</AppText></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {quickActions.map(action => <Pressable key={action.label} disabled={!action.href} accessibilityRole={action.href ? 'link' : 'button'}
            accessibilityLabel={action.href ? action.label : `${action.label}, coming soon`} accessibilityState={{ disabled: !action.href }}
            onPress={() => { if (action.href === '/transfer') openSheet({ kind: 'transfer' }); else if (action.href) router.push(action.href); }}
            style={({ pressed }) => ({ flex: 1, minWidth: fontScale > 1.2 ? 90 : 54, alignItems: 'center', gap: 8, paddingVertical: 8, opacity: !action.href ? 0.55 : pressed ? 0.7 : 1 })}>
            <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><AppIcon name={action.icon} color={colors.accent} /></View>
            <AppText size={11} tone="secondary">{action.label}</AppText>
          </Pressable>)}
        </View>
      </View>
      <Surface style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><AppText size={18} weight="600">Today</AppText><AppText size={12} tone="secondary">Money in & out</AppText></View>
        <View testID="today-chart" style={{ gap: 16 }}>
          {([{ label: 'Income', value: income, icon: 'income', color: colors.success }, { label: 'Expenses', value: expense, icon: 'expense', color: colors.accent }] as const).map(item => <View key={item.label} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><AppIcon name={item.icon} size={16} color={item.color} /><AppText size={13} tone="secondary">{item.label}</AppText></View>
              <MoneyText value={item.value} size={18} />
            </View>
            <View accessible={false} aria-hidden style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' }}><View style={{ height: 8, borderRadius: 4, width: `${item.value / scale * 100}%`, backgroundColor: item.color }} /></View>
          </View>)}
        </View>
        <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, gap: 4 }}>
          <AppText size={12} tone="secondary">{net > 0 ? 'Net increase today' : net < 0 ? 'Net decrease today' : 'Net change today'}</AppText>
          <View testID="today-net"><MoneyText value={net} size={24} /></View>
          {!income && !expense ? <AppText size={12} tone="secondary">No income or expenses today.</AppText> : null}
        </View>
      </Surface>
      <PaymentsDue />
      {overview.budgets.length ? <Surface style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText size={18} weight="600">Budgets</AppText>
          <Button label="See all" variant="quiet" onPress={() => router.push('/plan')} />
        </View>
        <View testID="home-budgets">
          {/* The three closest to (or over) their limit first. */}
          {[...overview.budgets].sort((left, right) => right.spentMinor / right.limitMinor - left.spentMinor / left.limitMinor).slice(0, 3)
            .map((budget, index) => <View key={budget.id} style={{ borderTopWidth: index ? 1 : 0, borderColor: colors.border }}><BudgetProgress budget={budget} /></View>)}
        </View>
      </Surface> : null}
    </View>}
  </ScrollView>
    {overview.wallet || overview.archivedWallets.length ? <FloatingStreak /> : null}
  </View>;
}
