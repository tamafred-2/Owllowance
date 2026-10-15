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
const Context = createContext({ colors: light, isDark: false });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useColorScheme() === 'dark';
  return <Context.Provider value={{ colors: isDark ? dark : light, isDark }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
