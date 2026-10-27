import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { ExpenseScreen } from './expense-screen';
import { TransferScreen } from './transfer-screen';
import { NewWalletScreen } from './new-wallet-screen';
import { savedMessages } from './saved-feedback';
import { FrameContext, OpenContext, type Sheet, type SheetFrame } from './sheet-context';

// Entry forms as a bottom sheet over the current page. The sheet library runs the pan-to-close and
// the form's scrolling together on the UI thread, so scrolling to the top and pulling on is one motion.
export function SheetHost({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Closing is requested through state; the effect talks to the sheet.
  const [dismissals, setDismissals] = useState(0);
  const close = useCallback((saved?: string) => {
    if (saved && savedMessages[saved]) setToast(savedMessages[saved]);
    setDismissals(count => count + 1);
  }, []);
  useEffect(() => { if (dismissals) ref.current?.dismiss(); }, [dismissals]);
  useEffect(() => { if (sheet) ref.current?.present(); }, [sheet]);
  // Android back closes the sheet before leaving the page.
  useEffect(() => {
    if (!sheet) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [sheet, close]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  const frame = useMemo<SheetFrame | null>(() => sheet ? {
    params: Object.fromEntries(Object.entries(sheet).filter(([key]) => key !== 'kind').map(([key, value]) => [key, value as string | undefined])),
    close, replace: setSheet,
  } : null, [sheet, close]);
  const backdrop = useCallback((props: BottomSheetBackdropProps) =>
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} pressBehavior="close" accessibilityLabel="Close form" />, []);
  const handle = useCallback(() => <View testID="sheet-handle" accessible accessibilityRole="button" accessibilityLabel="Drag down to close" onAccessibilityTap={() => close()}
    style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
  </View>, [colors.border, close]);
  return <OpenContext.Provider value={setSheet}>
      {children}
      {toast ? <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, alignItems: 'center' }}>
        <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 4, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
          <AppText size={14} tone="success" weight="600">{toast}</AppText>
        </View>
      </View> : null}
      <BottomSheetModal ref={ref} snapPoints={['94%']} enableDynamicSizing={false} enablePanDownToClose topInset={insets.top}
        onDismiss={() => setSheet(null)} backdropComponent={backdrop} handleComponent={handle}
        keyboardBehavior="interactive" keyboardBlurBehavior="restore" android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        {sheet && frame ? <FrameContext.Provider value={frame}>
          <View testID="entry-sheet" key={JSON.stringify(sheet)} style={{ flex: 1, paddingBottom: insets.bottom }}>
            {sheet.kind === 'entry' ? <ExpenseScreen /> : sheet.kind === 'transfer' ? <TransferScreen /> : <NewWalletScreen />}
          </View>
        </FrameContext.Provider> : null}
      </BottomSheetModal>
  </OpenContext.Provider>;
}
