import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '../design-system/primitives';
import { AppIcon, type IconName } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import { AnchoredMenu, type MenuAnchor } from './anchored-menu';

type Target = { label: string; icon: IconName; go: () => void; tone: 'accent' | 'success' };
const targets: Target[] = [
  { label: 'Add expense', icon: 'expense', tone: 'accent', go: () => router.push({ pathname: '/expense', params: { mode: 'expense' } }) },
  { label: 'Add income', icon: 'income', tone: 'success', go: () => router.push({ pathname: '/expense', params: { mode: 'income' } }) },
  { label: 'Transfer', icon: 'transfer', tone: 'accent', go: () => router.push('/transfer') },
  { label: 'Add wallet', icon: 'wallet', tone: 'accent', go: () => router.push('/wallet-new') },
];

// The main Add action: one tap to any kind of new record.
export function AddMenu({ anchor, onClose }: { anchor: MenuAnchor; onClose: () => void }) {
  const { colors } = useTheme();
  return <AnchoredMenu anchor={anchor} onClose={onClose} align="center" closeLabel="Close add menu" testID="add-menu">
    <View accessibilityRole="menu" style={{ gap: 2 }}>
      {targets.map(target => <Pressable key={target.label} accessibilityRole="menuitem" accessibilityLabel={target.label}
        onPress={() => { onClose(); target.go(); }}
        style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? colors.muted : 'transparent' })}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}>
          <AppIcon name={target.icon} size={18} color={target.tone === 'success' ? colors.success : colors.accent} />
        </View>
        <AppText size={15} weight="500">{target.label}</AppText>
      </Pressable>)}
    </View>
  </AnchoredMenu>;
}
