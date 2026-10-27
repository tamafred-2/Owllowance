import { Pressable, View } from 'react-native';
import type { ActivityItem } from '../domain/ledger';
import { displayDate } from '../domain/date';
import { AppText, MoneyText } from '../design-system/primitives';
import { AppIcon, type IconName } from '../design-system/icon';
import { categoryColors, useTheme } from '../design-system/theme';

function title(item: ActivityItem, walletHistory: boolean): string {
  if (item.type === 'opening') return 'Opening balance';
  if (item.goalId) {
    const into = item.amountMinor < 0;
    if (!walletHistory) return into ? `${item.walletName} → ${item.counterpartyName}` : `${item.counterpartyName} → ${item.walletName}`;
    return into ? `Saved to ${item.counterpartyName}` : `Taken from ${item.counterpartyName}`;
  }
  if (item.type === 'transfer') {
    if (!walletHistory) return `${item.walletName} → ${item.counterpartyName}`;
    return item.amountMinor < 0 ? `Transfer to ${item.counterpartyName}` : `Transfer from ${item.counterpartyName}`;
  }
  if (walletHistory) return `${item.type === 'income' ? 'Cash in' : 'Cash out'} / ${item.categoryName}`;
  return item.type === 'income' ? `Income / ${item.categoryName}` : item.categoryName ?? '';
}

export function TransactionRow({ item, walletHistory = false, onPress }: { item: ActivityItem; walletHistory?: boolean; onPress?: (item: ActivityItem) => void }) {
  const { colors, isDark } = useTheme();
  const tint = item.categoryId ? categoryColors(item.colorToken, isDark) : { background: colors.muted, foreground: colors.textSecondary };
  const icon = (item.type === 'expense' || item.type === 'income') && item.iconKey ? item.iconKey as IconName : item.goalId ? 'goals' : item.type;
  // Global history shows a transfer once as a neutral movement; wallet history shows its signed side.
  const neutral = item.type === 'transfer' && !walletHistory;
  const positive = item.type === 'income' || (item.type === 'transfer' && walletHistory && item.amountMinor > 0);
  const label = title(item, walletHistory);
  const content = <>
    <View style={{ backgroundColor: tint.background, borderRadius: 12, padding: 12 }}><AppIcon name={icon} color={item.type === 'income' && !item.iconKey ? colors.success : tint.foreground} /></View>
    <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
      <AppText size={14} weight="500">{label}</AppText>
      <AppText size={12} tone="secondary">{walletHistory || item.type === 'transfer' ? displayDate(item.localDate) : `${item.walletName} · ${displayDate(item.localDate)}`}</AppText>
      {item.note ? <AppText size={12} tone="secondary" numberOfLines={2}>{item.note}</AppText> : null}
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {positive ? <AppText size={16} tone="success">+</AppText> : null}
        <MoneyText value={neutral ? Math.abs(item.amountMinor) : item.amountMinor} size={16} style={positive ? { color: colors.success } : undefined} />
      </View>
      {item.feeMinor ? <View testID="transfer-fee" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <MoneyText value={-item.feeMinor} size={11} style={{ fontWeight: '400', color: colors.textSecondary }} />
        <AppText size={11} tone="secondary">fee</AppText>
      </View> : null}
    </View>
  </>;
  const style = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border };
  if (!onPress || item.type === 'opening') return <View style={style}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${displayDate(item.localDate)}. Open details`} onPress={() => onPress(item)}
    style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>{content}</Pressable>;
}
