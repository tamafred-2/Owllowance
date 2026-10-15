import { NativeModules, Platform } from 'react-native';

const nativeLoading = Platform.OS === 'android' ? NativeModules.OwllowanceNativeLoading as
  { active: boolean; contentReady: () => void } | undefined : undefined;

// Older installed binaries and other platforms keep the React loading screen.
export const hasNativeLoading = nativeLoading?.active === true;
export function finishNativeLoading() { nativeLoading?.contentReady(); }
