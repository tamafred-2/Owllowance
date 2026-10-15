import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { artwork } from '../design-system/artwork';
import { useActiveMotion } from './use-active-motion';

export function OpeningScreen({ onIntroComplete }: { onIntroComplete?: () => void }) {
  const { animate, ready, reducedMotion } = useActiveMotion();
  const { width } = useWindowDimensions();
  const [failed, setFailed] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);
  const complete = useRef(onIntroComplete);
  useEffect(() => { complete.current = onIntroComplete; }, [onIntroComplete]);
  useEffect(() => {
    // Release the native draw gate once React has committed the intro.
    // Waiting for Image.onLoad here can leave Android's first draw blocked.
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    // Decode failure must never trap the user behind the intro.
    watchdog.current = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
      complete.current?.();
    }, 5000);
    return () => { if (watchdog.current) clearTimeout(watchdog.current); if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    if (ready && reducedMotion) {
      complete.current?.();
    }
  }, [ready, reducedMotion]);
  function begin() {
    if (!ready || (!animate && !reducedMotion)) return;
    void SplashScreen.hideAsync().catch(() => {});
    if (started.current) return;
    if (watchdog.current) clearTimeout(watchdog.current);
    started.current = true;
    // The supplied branded loop is 41 frames / 2400ms.
    timer.current = setTimeout(() => {
      complete.current?.();
    }, animate ? 2400 : 0);
  }
  const motion = ready && animate && !failed;
  const size = Math.min(300, Math.max(144, width - 40));
  // Match the supplied GIF's opaque background, including in system dark mode.
  return <SafeAreaView style={{ flex: 1, backgroundColor: artwork.startup.background }}>
    <View testID="app-opening" accessibilityRole="progressbar" accessibilityLabel="Opening Owllowance" accessibilityState={{ busy: true }}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      {ready && (animate || reducedMotion || failed) ? <Image key={motion ? 'branded-loop' : 'still'}
        source={motion ? artwork.startup.loading : artwork.startup.still}
        testID={motion ? 'opening-motion' : 'opening-still'} resizeMode="contain" fadeDuration={0} accessible={false} aria-hidden
        style={{ width: motion ? size : 144, height: motion ? size : 144 }} onLoad={begin}
        onError={() => { setFailed(true); void SplashScreen.hideAsync().catch(() => {}); complete.current?.(); }} /> : null}
      <ActivityIndicator testID="opening-spinner" animating={animate} color={artwork.startup.accent} size="small" />
    </View>
  </SafeAreaView>;
}
