import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { ExpenseScreen } from './expense-screen';
import { TransferScreen } from './transfer-screen';
import { NewWalletScreen } from './new-wallet-screen';
import { savedMessages } from './saved-feedback';

import { FrameContext, OpenContext, type Sheet, type SheetFrame } from './sheet-context';

const NATIVE = Platform.OS !== 'web';

export function SheetHost({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [slide] = useState(() => new Animated.Value(1));
  const close = useCallback((saved?: string) => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: NATIVE }).start(() => setSheet(null));
    if (saved && savedMessages[saved]) setToast(savedMessages[saved]);
  }, [slide]);
  useEffect(() => {
    if (!sheet) return;
    slide.setValue(1);
    Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: NATIVE }).start();
  }, [sheet, slide]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  const frame = useMemo<SheetFrame | null>(() => sheet ? {
    params: Object.fromEntries(Object.entries(sheet).filter(([key]) => key !== 'kind').map(([key, value]) => [key, value as string | undefined])),
    close, replace: setSheet,
  } : null, [sheet, close]);
  return <OpenContext.Provider value={setSheet}>
    {children}
    {toast ? <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 4, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
        <AppText size={14} tone="success" weight="600">{toast}</AppText>
      </View>
    </View> : null}
    {sheet && frame ? <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={() => close()} style={{ flex: 1 }} />
      </Animated.View>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View testID="entry-sheet" style={{ height: Math.min(height - insets.top - 24, height * 0.94), backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: insets.bottom,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }] }}>
          <View accessible={false} style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 }} />
          <FrameContext.Provider value={frame}>
            <View key={JSON.stringify(sheet)} style={{ flex: 1 }}>
              {sheet.kind === 'entry' ? <ExpenseScreen /> : sheet.kind === 'transfer' ? <TransferScreen /> : <NewWalletScreen />}
            </View>
          </FrameContext.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </OpenContext.Provider>;
}
