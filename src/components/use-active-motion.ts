import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

export function useActiveMotion(enabled = true) {
  // Static until the OS preference resolves, so reduced-motion users never see a flash.
  const [reducedMotion, setReducedMotion] = useState(true);
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReducedMotion(value);
    }).catch(() => { /* Keep the static fallback if the preference is unavailable. */ })
      .finally(() => { if (mounted) setReady(true); });
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const lifecycle = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; preference.remove(); lifecycle.remove(); };
  }, []);
  return { ready, reducedMotion, active: enabled && foreground, animate: enabled && foreground && !reducedMotion };
}
