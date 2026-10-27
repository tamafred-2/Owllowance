import { Link } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import type { Wallet } from '../domain/ledger';
import { walletKindLabels } from '../domain/ledger';
import { AppText, Button, MoneyText } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import { walletAppearance } from '../design-system/wallet-appearance';
import type { MenuAnchor } from './anchored-menu';
import { WalletBadge } from './wallet-card';

type ViewProps = {
  label: (wallet: Wallet) => string;
  onMenu: (wallet: Wallet, anchor: MenuAnchor) => void;
  hidden: (wallet: Wallet) => boolean;
  balanceToggle: (wallet: Wallet, color: string) => ReactNode;
};

function MenuButton({ wallet, label, color, onMenu }: { wallet: Wallet; label: string; color: string; onMenu: ViewProps['onMenu'] }) {
  const ref = useRef<View>(null);
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Wallet options: ${label}`} hitSlop={4}
    onPress={() => ref.current?.measureInWindow((x, y, width, height) => onMenu(wallet, { x, y, width, height }))}
    style={({ pressed }) => ({ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
    <AppIcon name="more" color={color} />
  </Pressable>;
}

export function WalletRow({ wallet, label, onMenu, hidden, balanceToggle }: ViewProps & { wallet: Wallet }) {
  const { colors } = useTheme();
  const name = label(wallet);
  return <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border }}>
    <Link href={{ pathname: '/wallet-manage', params: { id: wallet.id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Manage ${name}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
        <WalletBadge name={wallet.name} kind={wallet.kind} />
        <View style={{ flex: 1 }}>
          <AppText size={15} weight="600" numberOfLines={1}>{name}</AppText>
          <AppText size={12} tone="secondary">{`${walletKindLabels[wallet.kind]}${wallet.archivedAt ? ' / Archived' : ''}`}</AppText>
        </View>
        <MoneyText value={wallet.balanceMinor} size={16} hidden={hidden(wallet)} />
      </Pressable>
    </Link>
    {balanceToggle(wallet, colors.textSecondary)}
    <MenuButton wallet={wallet} label={name} color={colors.textSecondary} onMenu={onMenu} />
  </View>;
}

// Web renders the card as a link, which browsers drag natively and which would swallow the swipe.
const undraggable = (node: View | null) => {
  if (Platform.OS === 'web' && node) (node as unknown as { setAttribute?: (name: string, value: string) => void }).setAttribute?.('draggable', 'false');
};

const PEEK = 20;
const SWIPE = 60;

// One wallet in front with up to two peeking behind; swipe up for the next, down for the previous.
export function WalletDeck({ wallets, label, onMenu, hidden, balanceToggle, onDragChange }: ViewProps & { wallets: Wallet[]; onDragChange: (dragging: boolean) => void }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [drag] = useState(() => new Animated.Value(0));
  // Web fires a click when a drag ends on the card link; ignore it.
  const draggedRef = useRef(false);
  const swallowPress = useCallback(() => draggedRef.current, []);
  const count = wallets.length;
  const current = count ? index % count : 0;
  const cardWidth = Math.min(width, 380);
  const cardHeight = cardWidth / 1.586;
  // Reset after the next card is in front, so the old front never flashes back.
  useLayoutEffect(() => { drag.setValue(0); }, [current, drag]);
  const step = useCallback((direction: 1 | -1) => {
    if (count < 2) return;
    Animated.timing(drag, { toValue: direction === 1 ? -cardHeight : PEEK * 3, duration: 180, useNativeDriver: false })
      .start(() => setIndex(value => (value + direction + count) % count));
  }, [count, cardHeight, drag]);
  // The gesture handlers read draggedRef only when a swipe fires, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { draggedRef.current = true; onDragChange(true); },
    onPanResponderMove: (_, gesture) => drag.setValue(Math.max(Math.min(gesture.dy, PEEK * 3), -400)),
    onPanResponderRelease: (_, gesture) => {
      onDragChange(false);
      setTimeout(() => { draggedRef.current = false; }, 100);
      if (gesture.dy < -SWIPE) step(1);
      else if (gesture.dy > SWIPE) step(-1);
      else Animated.spring(drag, { toValue: 0, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => { draggedRef.current = false; onDragChange(false); Animated.spring(drag, { toValue: 0, useNativeDriver: false }).start(); },
    onPanResponderTerminationRequest: () => false,
  }), [drag, onDragChange, step]);
  if (!count) return null;
  const visible = Array.from({ length: Math.min(3, count) }, (_, depth) => ({ wallet: wallets[(current + depth) % count], depth }));
  const progress = cardHeight ? drag.interpolate({ inputRange: [-cardHeight, 0], outputRange: [1, 0], extrapolate: 'clamp' }) : drag;
  return <View style={{ gap: 12 }}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} {...responder.panHandlers}
      onTouchStart={() => onDragChange(true)} onTouchEnd={() => onDragChange(false)} onTouchCancel={() => onDragChange(false)}
      style={{ height: cardHeight + PEEK * 2, alignItems: 'center' }} testID="wallet-deck">
      {cardWidth ? visible.slice().reverse().map(({ wallet, depth }) => {
        const front = depth === 0;
        const transform = front
          ? [{ translateY: drag }]
          : [{ translateY: Animated.subtract(depth * PEEK, Animated.multiply(progress, PEEK)) }, { scale: Animated.add(1 - depth * 0.05, Animated.multiply(progress, 0.05)) }];
        return <Animated.View key={wallet.id} pointerEvents={front ? 'auto' : 'none'} importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}
          style={{ position: 'absolute', top: 0, width: cardWidth, height: cardHeight, transform, opacity: front ? progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1 - depth * 0.15 }}>
          <DeckCard wallet={wallet} label={label} onMenu={onMenu} hidden={hidden} balanceToggle={balanceToggle} swallowPress={swallowPress} />
        </Animated.View>;
      }) : null}
    </View>
    {count > 1 ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Button label="Previous wallet" icon="up" iconOnly variant="quiet" onPress={() => step(-1)} />
      <AppText testID="wallet-deck-position" size={13} tone="secondary">{`${current + 1} of ${count}`}</AppText>
      <Button label="Next wallet" icon="down" iconOnly variant="quiet" onPress={() => step(1)} />
    </View> : null}
  </View>;
}

function DeckCard({ wallet, label, onMenu, hidden, balanceToggle, swallowPress }: ViewProps & { wallet: Wallet; swallowPress: () => boolean }) {
  const palette = walletAppearance(wallet.name, wallet.kind);
  const name = label(wallet);
  // Solid wallet color with faint shapes; deliberately no card number, chip or expiry.
  return <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.color, elevation: 4, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
    <View accessible={false} style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, backgroundColor: 'rgba(255,255,255,0.08)' }} />
    <View accessible={false} style={{ position: 'absolute', width: 160, height: 160, borderRadius: 80, right: 30, bottom: -100, backgroundColor: 'rgba(255,255,255,0.06)' }} />
    <Link href={{ pathname: '/wallet-manage', params: { id: wallet.id } }} asChild onPress={event => { if (swallowPress()) event.preventDefault(); }}>
      <Pressable ref={undraggable} accessibilityRole="link" accessibilityLabel={`Manage ${name}`} style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 36 }}>
          <WalletBadge name={wallet.name} kind={wallet.kind} />
          <View style={{ flex: 1 }}>
            <AppText size={17} weight="700" numberOfLines={1} style={{ color: palette.ink }}>{name}</AppText>
            <AppText size={12} style={{ color: palette.ink, opacity: 0.85 }}>{`${walletKindLabels[wallet.kind]} / PHP`}</AppText>
          </View>
        </View>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText size={11} weight="500" style={{ color: palette.ink, letterSpacing: 1 }}>BALANCE</AppText>
            <View style={{ margin: -9 }}>{balanceToggle(wallet, palette.ink)}</View>
          </View>
          <MoneyText value={wallet.balanceMinor} size={30} fit hidden={hidden(wallet)} style={{ color: palette.ink }} />
        </View>
      </Pressable>
    </Link>
    <View style={{ position: 'absolute', right: 6, top: 10 }}><MenuButton wallet={wallet} label={name} color={palette.ink} onMenu={onMenu} /></View>
  </View>;
}
