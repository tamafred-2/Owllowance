import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Image, Platform } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from '../src/components/app-shell';
import { ThemeProvider } from '../src/design-system/theme';
import { TrackerProvider, useTracker } from '../src/features/tracker/presentation/tracker-context';
import { forestSceneAt, forestScenes } from '../src/design-system/artwork';

// iOS/older binaries retain the native splash until React can replace it.
// The Android native GIF overlay releases its own OS draw gate earlier.
SplashScreen.setOptions({ duration: 0, fade: false });
void SplashScreen.preventAutoHideAsync().catch(() => {});
if (Platform.OS !== 'web') {
  const forest = Image.resolveAssetSource(forestScenes[forestSceneAt(new Date())].image);
  if (forest?.uri) void Image.prefetch(forest.uri).catch(() => {});
}

// Stored preferences apply once local data opens; the system theme is used until then.
function ThemedApp() {
  const settings = useTracker().overview?.settings;
  const preferences = settings ? { theme: settings.theme, reduceMotion: false } : undefined;
  const dark = settings?.theme === 'dark' ? 'light' : settings?.theme === 'light' ? 'dark' : 'auto';
  // Sheets render where this provider sits: inside the data/theme providers, above the shell's nested layout,
  // so they measure the full window.
  return <ThemeProvider preferences={preferences}><BottomSheetModalProvider><StatusBar style={dark} /><AppShell /></BottomSheetModalProvider></ThemeProvider>;
}

export default function RootLayout() {
  // Gesture root for the entry bottom sheet.
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><TrackerProvider><ThemedApp /></TrackerProvider></SafeAreaProvider></GestureHandlerRootView>;
}
