import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Image, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from '../src/components/app-shell';
import { ThemeProvider } from '../src/design-system/theme';
import { TrackerProvider } from '../src/features/tracker/presentation/tracker-context';
import { forestSceneAt, forestScenes } from '../src/design-system/artwork';

// iOS/older binaries retain the native splash until React can replace it.
// The Android native GIF overlay releases its own OS draw gate earlier.
SplashScreen.setOptions({ duration: 0, fade: false });
void SplashScreen.preventAutoHideAsync().catch(() => {});
if (Platform.OS !== 'web') {
  const forest = Image.resolveAssetSource(forestScenes[forestSceneAt(new Date())].image);
  if (forest?.uri) void Image.prefetch(forest.uri).catch(() => {});
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><TrackerProvider><StatusBar style="auto" /><AppShell /></TrackerProvider></ThemeProvider></SafeAreaProvider>;
}
