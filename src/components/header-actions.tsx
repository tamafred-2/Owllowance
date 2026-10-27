import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import { eventTime } from '../domain/date';
import { useTracker } from '../features/tracker/presentation/tracker-context';
import { RemindersModal } from '../features/tracker/presentation/reminders';

export function HeaderActions() {
  const { colors } = useTheme();
  const path = usePathname();
  const { overview } = useTracker();
  const [remindersOpen, setRemindersOpen] = useState(false);
  // The bell counts what is due today or overdue.
  const today = eventTime().localDate;
  const dueNow = (overview?.due ?? []).filter(item => item.dueDate <= today).length;
  const circle = (name: 'notifications' | 'settings') => <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
    <AppIcon name={name} size={18} color={colors.accent} />
  </View>;
  return <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={dueNow ? `Reminders, ${dueNow} due` : 'Reminders'} onPress={() => setRemindersOpen(true)}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      {circle('notifications')}
      {dueNow ? <View testID="reminder-badge" style={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}>
        <AppText size={10} weight="700" style={{ color: '#FFFFFF', lineHeight: 14 }}>{dueNow > 9 ? '9+' : String(dueNow)}</AppText>
      </View> : null}
    </Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel="Settings" onPress={() => router.push({ pathname: '/settings', params: { from: path } })}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>{circle('settings')}</Pressable>
    {remindersOpen ? <RemindersModal onClose={() => setRemindersOpen(false)} /> : null}
  </View>;
}
