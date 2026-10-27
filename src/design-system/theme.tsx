import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F6F8', surface: '#FFFFFF', textPrimary: '#202733', textSecondary: '#566273',
  border: '#E2E6EC', accent: '#24476B', onAccent: '#FFFFFF', muted: '#EDF1F5',
  error: '#A12828', success: '#236449',
};
const dark: typeof light = {
  background: '#171B22', surface: '#222833', textPrimary: '#F3F5F7', textSecondary: '#BAC3CF',
  border: '#3B4656', accent: '#A4C6E8', onAccent: '#172A3D', muted: '#2C3542',
  error: '#FFAAAA', success: '#8CD5B4',
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 16, lg: 24 };
// Scene-specific overlay colors keep forest details subtle behind readable text.
export const forestSummaryColors = {
  day: { background: 'rgba(255, 248, 235, 0.9)', border: 'rgba(255, 253, 247, 0.75)', text: '#24364B', secondary: '#42566A' },
  night: { background: 'rgba(20, 37, 58, 0.9)', border: 'rgba(176, 198, 222, 0.35)', text: '#F4F1E9', secondary: '#C3D3E4' },
};
// Muted category tints; each pair keeps icon contrast on its own background.
const categoryPalette = {
  accent: { light: ['#E3EBF4', '#24476B'], dark: ['#2A3A4D', '#A4C6E8'] },
  success: { light: ['#E1F0E8', '#236449'], dark: ['#21392F', '#8CD5B4'] },
  slate: { light: ['#E8EBEF', '#4A5566'], dark: ['#323A46', '#C3CBD6'] },
  teal: { light: ['#DDF0EF', '#1D6362'], dark: ['#1F3A3B', '#86D0CD'] },
  amber: { light: ['#F7ECD6', '#7A5310'], dark: ['#41361F', '#E8C27A'] },
  rose: { light: ['#F6E3E6', '#8A3443'], dark: ['#432A30', '#EBA7B3'] },
  violet: { light: ['#ECE6F6', '#55408A'], dark: ['#352E47', '#C2B2EA'] },
  orange: { light: ['#F8E6DA', '#8A4518'], dark: ['#45301F', '#F0B48B'] },
} as const;
export type CategoryColorToken = keyof typeof categoryPalette;
export function categoryColors(token: string | null, isDark: boolean): { background: string; foreground: string } {
  const pair = (categoryPalette[token as CategoryColorToken] ?? categoryPalette.accent)[isDark ? 'dark' : 'light'];
  return { background: pair[0], foreground: pair[1] };
}

export type ThemePreferences = { theme: 'system' | 'light' | 'dark'; reduceMotion: boolean };
const Context = createContext({ colors: light, isDark: false, reduceMotion: false });
export function ThemeProvider({ children, preferences }: { children: ReactNode; preferences?: ThemePreferences }) {
  const system = useColorScheme();
  const isDark = (preferences?.theme && preferences.theme !== 'system' ? preferences.theme : system) === 'dark';
  return <Context.Provider value={{ colors: isDark ? dark : light, isDark, reduceMotion: preferences?.reduceMotion ?? false }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
