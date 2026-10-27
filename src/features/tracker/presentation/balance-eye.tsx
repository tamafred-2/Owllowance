import { useRef } from 'react';
import { Pressable, type GestureResponderEvent } from 'react-native';
import { AppIcon } from '../../../design-system/icon';
import { useTheme } from '../../../design-system/theme';
import { useTracker } from './tracker-context';

// `target` is a wallet ID or NET_WORTH; each balance is hidden independently.
export function useBalanceHidden(target: string): boolean {
  return useTracker().overview?.settings.hiddenBalances.includes(target) ?? false;
}

export function BalanceEye({ target, color, size = 18 }: { target: string; color?: string; size?: number }) {
  const { service, refresh } = useTracker();
  const { colors } = useTheme();
  const hidden = useBalanceHidden(target);
  const inFlight = useRef(false);
  async function toggle() {
    if (!service || inFlight.current) return;
    inFlight.current = true;
    try { await service.repository.setBalanceHidden(target, !hidden); await refresh(); }
    catch { /* The balance simply stays as it was. */ }
    finally { inFlight.current = false; }
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'} onPress={(event: GestureResponderEvent) => {
    // Inside a card link: keep the tap from also opening the card (web anchors navigate on click).
    event.preventDefault?.(); event.stopPropagation?.();
    void toggle();
  }} hitSlop={8}
    style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
    <AppIcon name={hidden ? 'hidden' : 'visible'} size={size} color={color ?? colors.textSecondary} />
  </Pressable>;
}
