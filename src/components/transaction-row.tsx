import { View } from 'react-native';
import type { ActivityItem } from '../domain/ledger';
import { displayDate } from '../domain/date';
import { AppText, MoneyText } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';

export function TransactionRow({ item }: { item: ActivityItem }) {
  const { colors } = useTheme();
  const opening = item.type === 'opening';
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border }}>
    <View style={{ backgroundColor: colors.muted, borderRadius: 12, padding: 12 }}><AppIcon name={item.type} color={item.type === 'income' ? colors.success : colors.textSecondary} /></View>
    <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
      <AppText size={14} weight="500">{opening ? 'Opening balance' : item.type === 'income' ? `Income / ${item.categoryName}` : item.categoryName}</AppText>
      <AppText size={12} tone="secondary">{item.walletName} · {displayDate(item.localDate)}</AppText>
      {item.note ? <AppText size={12} tone="secondary">{item.note}</AppText> : null}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>{item.type === 'income' ? <AppText size={16} tone="success">+</AppText> : null}<MoneyText value={item.amountMinor} size={16} style={item.type === 'income' ? { color: colors.success } : undefined} /></View>
  </View>;
}
