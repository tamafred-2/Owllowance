import { Pressable, View } from 'react-native';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';

export function HeaderActions() {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0 }}>
    {(['notifications', 'settings'] as const).map(name => <Pressable key={name} disabled accessibilityRole="button"
      accessibilityLabel={`${name === 'notifications' ? 'Notifications' : 'Settings'}, coming soon`} accessibilityState={{ disabled: true }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        <AppIcon name={name} size={18} color={colors.accent} />
      </View>
    </Pressable>)}
  </View>;
}
