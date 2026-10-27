import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { AppText, Button, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Goal } from '../../../domain/ledger';
import { displayDate, eventTime } from '../../../domain/date';
import { formatMoney } from '../../../domain/money';
import { monthlyNeeded } from '../../../domain/goals';
import { useTracker } from './tracker-context';

export const goalIcons = ['savings', 'phone', 'travel', 'home', 'education', 'gift', 'family', 'entertainment', 'pets', 'beauty', 'shopping', 'other'] as const;

export function GoalProgress({ goal }: { goal: Goal }) {
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

// The goal's photo as a small square, or its icon when there is none (or the file is gone).
export function GoalBadge({ goal, size = 34 }: { goal: Pick<Goal, 'imageUri' | 'iconKey' | 'colorToken'>; size?: number }) {
  const { isDark } = useTheme();
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const tint = categoryColors(goal.colorToken, isDark);
  if (goal.imageUri && goal.imageUri !== brokenUri) {
    return <Image source={{ uri: goal.imageUri }} accessibilityIgnoresInvertColors onError={() => setBrokenUri(goal.imageUri)}
      style={{ width: size, height: size, borderRadius: size * 0.3 }} />;
  }
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center', backgroundColor: tint.background }}>
    <AppIcon name={goal.iconKey as IconName} size={size * 0.53} color={tint.foreground} />
  </View>;
}

// Plan: savings goals with progress; each opens its own page.
export function GoalsSection() {
  const { overview } = useTracker();
  const { colors } = useTheme();
  const goals = overview?.goals ?? [];
  return <Surface style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <AppText accessibilityRole="header" size={20} weight="600">Goals</AppText>
      <Button label="Add goal" variant="quiet" onPress={() => router.push('/goal-edit')} />
    </View>
    {goals.length ? <View testID="goal-list">{goals.map((goal, index) =>
      <Pressable key={goal.id} accessibilityRole="button" accessibilityLabel={`Open goal ${goal.name}`} onPress={() => router.push({ pathname: '/goal', params: { id: goal.id } })}
        style={({ pressed }) => ({ gap: 10, paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderColor: colors.border, opacity: pressed ? 0.7 : goal.archivedAt ? 0.6 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <GoalBadge goal={goal} />
          <AppText size={15} weight="600" style={{ flex: 1 }} numberOfLines={1}>{goal.name}</AppText>
          {goal.archivedAt ? <AppText size={12} tone="secondary">Archived</AppText> : <AppIcon name="next" size={18} color={colors.textSecondary} />}
        </View>
        <GoalProgress goal={goal} />
      </Pressable>)}</View> : <AppText size={14} tone="secondary" style={{ paddingVertical: 10 }}>Save toward something: a new phone, a trip or an emergency fund.</AppText>}
  </Surface>;
}
