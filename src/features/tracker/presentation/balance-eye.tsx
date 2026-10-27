import { useRef } from 'react';
import { Pressable, type GestureResponderEvent } from 'react-native';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { useTracker } from './tracker-context';

// One shared preference: any eye hides or shows amounts everywhere.
export function BalanceEye({ color, size = 18 }: { color?: string; size?: number }) {
  const { service, refresh } = useTracker();
  const { hideBalances, colors } = useTheme();
  const inFlight = useRef(false);
  async function toggle() {
    if (!service || inFlight.current) return;
    inFlight.current = true;
    try { await service.repository.saveSettings({ hideBalances: !hideBalances }); await refresh(); }
    catch { /* The amounts simply stay as they were. */ }
    finally { inFlight.current = false; }
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={hideBalances ? 'Show balances' : 'Hide balances'} onPress={(event: GestureResponderEvent) => {
    // Inside a card link: keep the tap from also opening the card (web anchors navigate on click).
    event.preventDefault?.(); event.stopPropagation?.();
    void toggle();
  }} hitSlop={8}
    style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
    <AppIcon name={hideBalances ? 'hidden' : 'visible'} size={size} color={color ?? colors.textSecondary} />
  </Pressable>;
}
