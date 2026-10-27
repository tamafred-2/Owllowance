import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../design-system/theme';

export type MenuAnchor = { x: number; y: number; width: number; height: number };

// `align: 'center'` centres the menu on its trigger (the Add button); default aligns right edges.
export function AnchoredMenu({ anchor, onClose, children, align = 'end', closeLabel = 'Close wallet menu', testID = 'wallet-dropdown' }: {
  anchor: MenuAnchor; onClose: () => void; children: ReactNode; align?: 'end' | 'center'; closeLabel?: string; testID?: string;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [menuHeight, setMenuHeight] = useState(240);
  const viewport = useRef({ width, height });
  useEffect(() => {
    if (viewport.current.width !== width || viewport.current.height !== height) onClose();
    viewport.current = { width, height };
  }, [width, height, onClose]);
  const menuWidth = Math.min(220, width - 24);
  const maxHeight = Math.max(48, height - insets.top - insets.bottom - 24);
  const actualHeight = Math.min(menuHeight, maxHeight);
  const preferred = align === 'center' ? anchor.x + anchor.width / 2 - menuWidth / 2 : anchor.x + anchor.width - menuWidth;
  const left = Math.max(12, Math.min(preferred, width - menuWidth - 12));
  const below = anchor.y + anchor.height + 4;
  const top = Math.max(insets.top + 12, Math.min(below + actualHeight <= height - insets.bottom - 12 ? below : anchor.y - actualHeight - 4, height - insets.bottom - actualHeight - 12));
  return <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
      <View accessibilityViewIsModal testID={testID} style={{ position: 'absolute', left, top, width: menuWidth, maxHeight, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, elevation: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.16)' }}>
        <ScrollView keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => setMenuHeight(h)} contentContainerStyle={{ padding: 6, gap: 2 }}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}
