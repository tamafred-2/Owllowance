import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextProps, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { formatMoney } from '../domain/money';
import { AppIcon, type IconName } from './icon';
import { radius, useTheme } from './theme';

export function AppText({ tone = 'primary', size = 16, weight = '400', style, ...props }: TextProps & {
  tone?: 'primary' | 'secondary' | 'error' | 'success'; size?: number; weight?: '400' | '500' | '600' | '700';
}) {
  const { colors } = useTheme();
  const color = tone === 'primary' ? colors.textPrimary : tone === 'secondary' ? colors.textSecondary : colors[tone];
  return <Text {...props} style={[{ color, fontSize: size, lineHeight: size * 1.5, fontWeight: weight }, style]} />;
}

export function MoneyText({ value, size = 24, style, fit = false }: { value: number; size?: number; style?: TextProps['style']; fit?: boolean }) {
  return <AppText size={size} weight="600" numberOfLines={fit ? 1 : undefined} adjustsFontSizeToFit={fit} minimumFontScale={0.6} style={[{ fontVariant: ['tabular-nums'] }, style]}>{formatMoney(value)}</AppText>;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 24 }, style]}>{children}</View>;
}

export function Button({ label, onPress, icon, variant = 'primary', disabled = false, busy = false }: {
  label: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'secondary' | 'quiet'; disabled?: boolean; busy?: boolean;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const color = variant === 'primary' ? colors.onAccent : colors.accent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    aria-disabled={disabled || busy} aria-busy={busy}
    disabled={disabled || busy} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.button, {
      backgroundColor: variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.muted : 'transparent',
      opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
      borderColor: focused ? colors.accent : 'transparent', borderWidth: 2,
    }]}>
    {busy ? <ActivityIndicator color={color} /> : icon ? <AppIcon name={icon} color={color} /> : null}
    <AppText size={14} weight="600" style={{ color }}>{busy ? 'Saving…' : label}</AppText>
  </Pressable>;
}

export function FormField({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  const { colors } = useTheme();
  return <View style={{ gap: 8 }}>
    <AppText size={14} weight="500">{label}</AppText>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.textSecondary}
      style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }, style]} />
    {hint ? <AppText size={12} tone="secondary">{hint}</AppText> : null}
  </View>;
}

export function Feedback({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <View accessibilityLiveRegion="polite" style={{ paddingVertical: 8 }}>
    <AppText size={14} tone={error ? 'error' : 'success'}>{children}</AppText>
  </View>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ paddingVertical: 36, alignItems: 'center', gap: 12 }}>
    <View style={{ padding: 14, backgroundColor: colors.muted, borderRadius: radius.md }}><AppIcon name="activity" size={24} /></View>
    <AppText weight="600">{title}</AppText>
    <AppText tone="secondary" size={14} style={{ textAlign: 'center', maxWidth: 320 }}>{message}</AppText>
    {action}
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
