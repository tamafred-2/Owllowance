import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Modal, View } from 'react-native';
import { AppText, Button, Feedback } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { artwork } from '../../../design-system/artwork';
import { canLockApp, onAppStateChange, unlockWithDevice } from '../../../platform/app-lock';
import { useTracker } from './tracker-context';

// Locks again after the app has been away this long.
const RELOCK_AFTER_MS = 30_000;

// Lock state for this app session: locked at start, unlocked by the device prompt (or by turning the lock on).
let locked = true;
const listeners = new Set<() => void>();
function setLocked(value: boolean) { locked = value; listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function markAppUnlocked() { setLocked(false); }

export function AppLockGate() {
  const { overview } = useTracker();
  const { colors } = useTheme();
  const enabled = canLockApp && Boolean(overview?.settings.appLock);
  const isLocked = useSyncExternalStore(subscribe, () => locked, () => locked);
  const [failed, setFailed] = useState(false);
  const away = useRef<number | null>(null);
  const prompting = useRef(false);
  const autoPrompted = useRef(false);
  useEffect(() => onAppStateChange(active => {
    // The device prompt itself can send the app to the background; that doesn't count as leaving.
    if (prompting.current) return;
    if (!active) { away.current = Date.now(); return; }
    if (away.current !== null && Date.now() - away.current >= RELOCK_AFTER_MS) { autoPrompted.current = false; setLocked(true); }
    away.current = null;
  }), []);
  async function unlock() {
    if (prompting.current) return;
    prompting.current = true; setFailed(false);
    try { if (await unlockWithDevice()) setLocked(false); else setFailed(true); }
    catch { setFailed(true); }
    finally { prompting.current = false; }
  }
  const show = enabled && isLocked;
  useEffect(() => {
    if (!show || autoPrompted.current) return;
    autoPrompted.current = true;
    void unlock();
  }, [show]);
  if (!show) return null;
  return <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
    <View testID="app-lock" style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <Image source={artwork.owl.night} accessible={false} resizeMode="contain" style={{ width: 120, height: 120 }} />
      <AppText accessibilityRole="header" size={24} weight="700">Owllowance is locked</AppText>
      <AppText size={15} tone="secondary" style={{ textAlign: 'center' }}>Use your fingerprint, face or phone PIN to open it.</AppText>
      {failed ? <Feedback error>Not unlocked. Try again.</Feedback> : null}
      <View style={{ alignSelf: 'stretch' }}><Button label="Unlock" onPress={() => { void unlock(); }} /></View>
    </View>
  </Modal>;
}
