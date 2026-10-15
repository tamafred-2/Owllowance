import { ScrollView, View, useWindowDimensions } from 'react-native';
import { HeaderActions } from '../../../components/header-actions';
import { AppText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';

export function PlanScreen() {
  const { width } = useWindowDimensions();
  return <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: width >= 900 ? 40 : 20 }}>
    <View style={{ width: '100%', maxWidth: 1050, alignSelf: 'center', gap: 24 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><AppText accessibilityRole="header" size={28} weight="700" style={{ flexShrink: 1 }}>Plan</AppText><HeaderActions /></View>
        <AppText size={14} tone="secondary">Make space for what&apos;s next.</AppText>
      </View>
      <Surface style={{ gap: 12, alignItems: 'center', paddingVertical: 40 }}>
        <AppIcon name="plan" size={32} /><AppText size={18} weight="600">Coming soon</AppText>
        <AppText size={14} tone="secondary" style={{ textAlign: 'center' }}>Your budgets, goals and planned payments will live here.</AppText>
      </Surface>
    </View>
  </ScrollView>;
}
