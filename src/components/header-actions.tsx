import { router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';

export function HeaderActions() {
  const { colors } = useTheme();
  const path = usePathname();
  const circle = (name: 'notifications' | 'settings', disabled: boolean) => <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.6 : 1 }}>
    <AppIcon name={name} size={18} color={colors.accent} />
  </View>;
  return <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
    <Pressable disabled accessibilityRole="button" accessibilityLabel="Notifications, coming soon" accessibilityState={{ disabled: true }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{circle('notifications', true)}</Pressable>
    <Pressable accessibilityRole="link" accessibilityLabel="Settings" onPress={() => router.push({ pathname: '/settings', params: { from: path } })}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>{circle('settings', false)}</Pressable>
  </View>;
}
