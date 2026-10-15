import { HeaderActions } from '../../../components/header-actions';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { forestSummaryColors, useTheme } from '../../../design-system/theme';
import { type WalletKind } from '../../../domain/ledger';
import { WalletCard } from '../../../components/wallet-card';
import { ForestScene } from '../../../components/forest-scene';
import { useTracker } from './tracker-context';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { WalletSetup } from './wallet-setup';

export function AccountsScreen() {
  const { overview } = useTracker();
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const compact = width >= 370 && fontScale <= 1.15 && ![...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])].some(wallet => Math.abs(wallet.balanceMinor) >= 1000000000);
  const [sceneVisible, setSceneVisible] = useState(true);
  if (!overview) return null;
  if (!overview.wallet && !overview.archivedWallets.length) return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}><WalletSetup /></ScrollView>;
  return <ScrollView showsVerticalScrollIndicator={false} onScroll={event => setSceneVisible(event.nativeEvent.contentOffset.y < 300)} scrollEventThrottle={100}
    contentContainerStyle={{ padding: width >= 900 ? 40 : 20 }}>
    <View style={{ maxWidth: 1050, width: '100%', alignSelf: 'center', gap: 24 }}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <AppText accessibilityRole="header" size={28} weight="700" style={{ flexShrink: 1 }}>Wallet</AppText>
            <HeaderActions />

          </View>
          <AppText size={14} tone="secondary">Your wallets, in one view.</AppText>
        </View>
        <ForestScene visible={sceneVisible}>
          {({ night }) => {
            const palette = forestSummaryColors[night ? 'night' : 'day'];
            return <Surface style={{ padding: 14, gap: 6, width: '100%', maxWidth: 360, alignSelf: 'flex-end', backgroundColor: palette.background, borderColor: palette.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppIcon name="wallet" size={15} color={palette.secondary} />
                <AppText size={11} weight="600" style={{ letterSpacing: 0.8, color: palette.secondary }}>NET WORTH</AppText>
              </View>
              <MoneyText value={overview.totalBalanceMinor} size={24} fit style={{ color: palette.text }} />
            </Surface>;
          }}
        </ForestScene>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText size={20} weight="600">Your wallets</AppText>
        <Link href="/wallet-new" asChild><Pressable accessibilityRole="link" accessibilityLabel="Add wallet" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
          <AppIcon name="add" color={colors.accent} /><AppText size={14} weight="600" style={{ color: colors.accent }}>Add wallet</AppText>
        </Pressable></Link>
      </View>
      {(['cash', 'ewallet', 'bank'] as WalletKind[]).map(kind => {
        const wallets = overview.wallets.filter(wallet => wallet.kind === kind);
        if (!wallets.length) return null;
        return <View key={kind} style={{ gap: 12 }}>
          <AppText size={14} weight="600" tone="secondary">{{ cash: 'Cash', ewallet: 'E-wallets', bank: 'Bank accounts' }[kind]}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            {wallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])} compact={compact} />)}
          </View>
        </View>;
      })}
      {!overview.wallets.length ? <AppText tone="secondary">No active wallets. Add one or restore an archived wallet below.</AppText> : null}
      {overview.archivedWallets.length ? <View style={{ gap: 16 }}>
        <AppText size={20} weight="600">Archived wallets</AppText>
        <AppText size={14} tone="secondary">Balances remain included in your total.</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          {overview.archivedWallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])} compact={compact} />)}
        </View>
      </View> : null}
    </View>
  </ScrollView>;
}
