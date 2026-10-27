import { Link } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import type { MenuAnchor } from './anchored-menu';
import { Pressable, View } from 'react-native';
import type { Wallet } from '../domain/ledger';
import { walletKindLabels } from '../domain/ledger';
import { AppText, MoneyText } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { walletAppearance } from '../design-system/wallet-appearance';

// Presets show short letters in the card's colors (no third-party logos are bundled); other wallets show the wallet icon.
export function WalletBadge({ name, kind }: Pick<Wallet, 'name' | 'kind'>) {
  const palette = walletAppearance(name, kind);
  // Solid brand color so it reads on any surface; the faint ring separates it from its own card.
  const ring = palette.ink === '#FFFFFF' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.15)';
  return <View style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, backgroundColor: palette.color, borderWidth: palette.badge ? 1 : 0, borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
    {palette.badge ? <AppText accessible={false} size={palette.badge.length > 2 ? 11 : palette.badge.length > 1 ? 13 : 16} weight="700" style={{ color: palette.ink }}>{palette.badge}</AppText>
      : <AppIcon name="wallet" size={19} color={palette.ink} />}
  </View>;
}

// `balanceToggle` sits beside the amount (replacing the arrow); it must stop its press from opening the card.
export function WalletCard({ wallet, compact, label = wallet.name, onMenu, balanceToggle, hidden = false }: { wallet: Wallet; compact: boolean; label?: string; onMenu: (anchor: MenuAnchor) => void; balanceToggle?: (color: string) => ReactNode; hidden?: boolean }) {
  const menuButton = useRef<View>(null);
  const palette = walletAppearance(wallet.name, wallet.kind);
  return <View style={{ width: compact ? '48%' : '100%', borderRadius: 18, backgroundColor: palette.color }}>
    <Link href={{ pathname: '/wallet-manage', params: { id: wallet.id } }} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={`Manage ${label}`} style={{ padding: 14, borderRadius: 18, backgroundColor: palette.color, width: '100%', minHeight: 144, gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 30 }}>
        <WalletBadge name={wallet.name} kind={wallet.kind} />
        <View style={{ flex: 1 }}><AppText size={13} weight="600" style={{ color: palette.ink }}>{label}</AppText><AppText size={10} style={{ color: palette.ink }}>{walletKindLabels[wallet.kind]} / PHP{wallet.archivedAt ? ' / Archived' : ''}</AppText></View>
      </View>
      <View style={{ gap: 2, marginTop: 'auto' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><AppText size={10} weight="500" style={{ color: palette.ink, letterSpacing: 1 }}>BALANCE</AppText>{balanceToggle ? null : <AppIcon name="expense" size={12} color={palette.ink} />}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1 }}><MoneyText value={wallet.balanceMinor} size={compact ? 21 : 28} fit hidden={hidden} style={{ color: palette.ink }} /></View>
          {balanceToggle ? <View style={{ marginRight: -8 }}>{balanceToggle(palette.ink)}</View> : null}
        </View>
      </View>
    </Pressable>
  </Link>
    <Pressable ref={menuButton} accessibilityRole="button" accessibilityLabel={`Wallet options: ${label}`} onPress={() => menuButton.current?.measureInWindow((x, y, width, height) => onMenu({ x, y, width, height }))}
      style={({ pressed }) => ({ position: 'absolute', right: 2, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
      <AppIcon name="more" color={palette.ink} />
    </Pressable>
  </View>;
}
