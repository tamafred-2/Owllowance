import { Link } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import type { MenuAnchor } from './anchored-menu';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import type { Wallet } from '../domain/ledger';
import { walletKindLabels } from '../domain/ledger';
import { AppText, MoneyText } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { goTymeBadgeColor, walletAppearance } from '../design-system/wallet-appearance';
import { SvgXml } from 'react-native-svg';
import { goTymeLogo } from '../design-system/provider-vectors';

const providerIcons: Record<string, ImageSourcePropType> = {
  GCash: require('../../assets/providers/gcash.png'),
  Maya: require('../../assets/providers/maya-app.jpg'),
  BPI: require('../../assets/providers/bpi.png'),
  MariBank: require('../../assets/providers/maribank.png'),
  Wise: require('../../assets/providers/wise.png'),
  Metrobank: require('../../assets/providers/metrobank.png'),
  PayPal: require('../../assets/providers/paypal.png'),
  BDO: require('../../assets/providers/bdo.jpg'),
  UnionBank: require('../../assets/providers/unionbank.jpg'),
};

export function WalletBadge({ name, kind }: Pick<Wallet, 'name' | 'kind'>) {
  const palette = walletAppearance(name, kind);
  const official = Boolean(providerIcons[palette.name]);
  const wordmark = palette.name === 'Metrobank';
  const backgroundColor = palette.name === 'GoTyme' ? goTymeBadgeColor : official && palette.name !== 'Metrobank' ? '#FFFFFF' : palette.color;
  return <View style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, overflow: 'hidden', backgroundColor, alignItems: 'center', justifyContent: 'center' }}>
    {palette.name === 'GoTyme' ? <SvgXml xml={goTymeLogo} width={32} height={28} accessible={false} /> : providerIcons[palette.name] ? <Image source={providerIcons[palette.name]} accessible={false} style={{ width: wordmark ? 32 : 36, height: wordmark ? 28 : 36, borderRadius: wordmark ? 0 : 9 }} resizeMode="contain" /> : <AppIcon name="wallet" size={19} color={palette.ink} />}
  </View>;
}

// `balanceToggle` replaces the arrow beside BALANCE; it must stop its press from opening the card.
export function WalletCard({ wallet, compact, label = wallet.name, onMenu, balanceToggle }: { wallet: Wallet; compact: boolean; label?: string; onMenu: (anchor: MenuAnchor) => void; balanceToggle?: (color: string) => ReactNode }) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><AppText size={10} weight="500" style={{ color: palette.ink, letterSpacing: 1 }}>BALANCE</AppText>{balanceToggle ? <View style={{ margin: -9 }}>{balanceToggle(palette.ink)}</View> : <AppIcon name="expense" size={12} color={palette.ink} />}</View>
        <MoneyText value={wallet.balanceMinor} size={compact ? 21 : 28} style={{ color: palette.ink }} />
      </View>
    </Pressable>
  </Link>
    <Pressable ref={menuButton} accessibilityRole="button" accessibilityLabel={`Wallet options: ${label}`} onPress={() => menuButton.current?.measureInWindow((x, y, width, height) => onMenu({ x, y, width, height }))}
      style={({ pressed }) => ({ position: 'absolute', right: 2, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
      <AppIcon name="more" color={palette.ink} />
    </Pressable>
  </View>;
}
