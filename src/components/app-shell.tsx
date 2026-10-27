import { Link, Slot, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Feedback } from '../design-system/primitives';
import { AppIcon, type IconName } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import { useTracker } from '../features/tracker/presentation/tracker-context';
import { OpeningScreen } from './opening-screen';
import { OwlAddShape } from './owl-add-shape';
import { AddMenu } from './add-menu';
import type { MenuAnchor } from './anchored-menu';
import * as SplashScreen from 'expo-splash-screen';
import { finishNativeLoading, hasNativeLoading } from '../platform/native-loading';

function NavItem({ href, label, icon, compact = false }: { href: '/' | '/activity' | '/accounts' | '/plan'; label: string; icon: IconName; compact?: boolean }) {
  const path = usePathname();
  const { colors, isDark } = useTheme();
  const active = path === href || (href === '/accounts' && (path === '/wallet-new' || path === '/wallet-manage'));
  // A soft accent tint marks the current tab; Android adds its ripple on press.
  const tint = isDark ? 'rgba(164, 198, 232, 0.18)' : 'rgba(36, 71, 107, 0.12)';
  return <Link href={href} asChild>
    <Pressable accessibilityRole="link" accessibilityState={{ selected: active }} android_ripple={{ color: tint, borderless: true, radius: 34 }} style={{
      flexDirection: compact ? 'column' : 'row', gap: compact ? 4 : 12, alignItems: 'center',
      padding: compact ? 4 : 14, minHeight: 56, borderRadius: 16, flex: compact ? 1 : undefined, minWidth: 0,
      backgroundColor: active && !compact ? tint : 'transparent',
    }}>
      <View style={compact ? { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? tint : 'transparent' } : undefined}>
        <AppIcon name={icon} size={active ? 22 : 20} color={active ? colors.accent : colors.textSecondary} />
      </View>
      <AppText size={compact ? 11 : 14} weight={active ? '700' : '400'} style={{ color: active ? colors.accent : colors.textSecondary }}>{label}</AppText>
    </Pressable>
  </Link>;
}

export function AppShell() {
  const path = usePathname();
  // Forms and sub-pages hide the main navigation and Add action.
  const formRoute = ['/wallet-new', '/wallet-manage', '/expense', '/transfer', '/settings', '/categories', '/reports'].includes(path);
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { colors } = useTheme();
  const { overview, loading, error, refresh } = useTracker();
  const [introComplete, setIntroComplete] = useState(hasNativeLoading);
  const canAdd = Boolean(overview?.wallet) && !error && !formRoute;
  const mobileAdd = useRef<View>(null);
  const sidebarAdd = useRef<View>(null);
  const [addAnchor, setAddAnchor] = useState<MenuAnchor | null>(null);
  const openAdd = (node: View | null) => node?.measureInWindow((x, y, w, h) => setAddAnchor({ x, y, width: w, height: h }));
  if (!error && (!introComplete || (loading && !overview))) return <OpeningScreen onIntroComplete={() => setIntroComplete(true)} />;
  return <KeyboardAvoidingView onLayout={() => { finishNativeLoading(); void SplashScreen.hideAsync().catch(() => {}); }} style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'android' ? 'height' : undefined}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      {wide ? <View style={[styles.sidebar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ padding: 14, gap: 4, marginBottom: 36 }}>
          <AppText size={24} weight="700">Owllowance</AppText>
          <AppText size={12} tone="secondary">A little more clarity.</AppText>
        </View>
        <NavItem href="/" label="Home" icon="home" />
        <NavItem href="/accounts" label="Wallet" icon="wallet" />
        <NavItem href="/plan" label="Plan" icon="plan" compact={!wide} />
        <NavItem href="/activity" label="History" icon="activity" />
        {canAdd ? <View style={{ marginTop: 24 }}><Pressable ref={sidebarAdd} accessibilityRole="button" accessibilityLabel="Add transaction" onPress={() => openAdd(sidebarAdd.current)}
          style={StyleSheet.flatten([styles.add, { backgroundColor: colors.accent }])}>
          <AppText size={14} weight="600" style={{ color: colors.onAccent }}>Add transaction</AppText>
        </Pressable></View> : null}
        <View style={{ flex: 1 }} />
      </View> : (overview?.wallet || overview?.archivedWallets.length) ? null : <View style={[styles.topbar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <AppText size={20} weight="700">Owllowance</AppText>
        <AppText size={12} tone="secondary">Budget & Expense Tracker</AppText>
      </View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        {error ? <View style={{ padding: 20, gap: 8, backgroundColor: colors.surface }}>
          <Feedback error>{error}</Feedback><Button label="Retry local storage" variant="secondary" onPress={() => { void refresh(); }} />
        </View> : null}
        {overview ? <Slot /> : <View style={{ padding: 24 }}><AppText tone="secondary">Your records have not been changed.</AppText></View>}
      </View>
      {!wide && !formRoute && !keyboardVisible ? <View testID="bottom-navigation" style={[styles.bottomBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <NavItem href="/" label="Home" icon="home" compact />
        <NavItem href="/accounts" label="Wallet" icon="wallet" compact />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {canAdd ? <Pressable ref={mobileAdd} accessibilityRole="button" accessibilityLabel="Add transaction" onPress={() => openAdd(mobileAdd.current)} style={styles.mobileAdd}>
            <OwlAddShape />
          </Pressable> : null}
        </View>
        <NavItem href="/plan" label="Plan" icon="plan" compact={!wide} />
        <NavItem href="/activity" label="History" icon="activity" compact />
      </View> : null}
    </View>
    {addAnchor ? <AddMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} /> : null}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  sidebar: { width: 240, borderRightWidth: 1, padding: 20 },
  topbar: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, gap: 2 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 28, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 6, paddingVertical: 8 },
  add: { minHeight: 48, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mobileAdd: { width: 72, height: 60, justifyContent: 'center', alignItems: 'center', marginTop: -12 },
});
