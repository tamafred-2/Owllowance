import { AnchoredMenu, type MenuAnchor } from '../../../components/anchored-menu';
import { AppModal } from '../../../components/app-modal';
import { HeaderActions } from '../../../components/header-actions';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText, Button, Feedback, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { forestSummaryColors, useTheme } from '../../../design-system/theme';
import { type Wallet, type WalletKind } from '../../../domain/ledger';
import { WalletCard } from '../../../components/wallet-card';
import { ForestScene } from '../../../components/forest-scene';
import { useTracker } from './tracker-context';
import { SavedFeedback } from './saved-feedback';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { WalletSetup } from './wallet-setup';
import { RenameWalletModal } from './rename-wallet-modal';
import { BalanceEye } from './balance-eye';

export function AccountsScreen() {
  const { overview, service, refresh, error: storageError } = useTracker();
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const [menuWallet, setMenuWallet] = useState<Wallet | null>(null);
  const [renameWallet, setRenameWallet] = useState<Wallet | null>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const inFlight = useRef(false);
  function openMenu(wallet: Wallet, position: MenuAnchor) { setAnchor(position); setMenuWallet(wallet); setConfirmArchive(false); setMenuError(null); }
  async function changeArchive() {
    if (!service || !menuWallet || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMenuError(null);
    try {
      await service.repository.setWalletArchived(menuWallet.id, !menuWallet.archivedAt);
      await refresh(); setMenuWallet(null); setConfirmArchive(false);
    } catch { setMenuError('Could not update this wallet. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
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
        <SavedFeedback saved={saved} />
        <ForestScene visible={sceneVisible}>
          {({ night }) => {
            const palette = forestSummaryColors[night ? 'night' : 'day'];
            return <Surface style={{ padding: 14, gap: 6, width: '100%', maxWidth: 360, alignSelf: 'flex-end', backgroundColor: palette.background, borderColor: palette.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppIcon name="wallet" size={15} color={palette.secondary} />
                <AppText size={11} weight="600" style={{ letterSpacing: 0.8, color: palette.secondary, flex: 1 }}>NET WORTH</AppText>
                <BalanceEye color={palette.secondary} size={16} />
              </View>
              <MoneyText value={overview.totalBalanceMinor} size={24} fit style={{ color: palette.text }} />
            </Surface>;
          }}
        </ForestScene>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText size={20} weight="600">Your wallets</AppText>
        <Link href="/wallet-new" asChild><Pressable accessibilityRole="link" accessibilityLabel="Add wallet" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
          <AppText size={14} weight="600" style={{ color: colors.accent }}>Add wallet</AppText>
        </Pressable></Link>
      </View>
      {(['cash', 'ewallet', 'bank'] as WalletKind[]).map(kind => {
        const wallets = overview.wallets.filter(wallet => wallet.kind === kind);
        if (!wallets.length) return null;
        return <View key={kind} style={{ gap: 12 }}>
          <AppText size={14} weight="600" tone="secondary">{{ cash: 'Cash', ewallet: 'E-wallets', bank: 'Bank accounts' }[kind]}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            {wallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])} compact={compact} onMenu={position => openMenu(wallet, position)} balanceToggle={color => <BalanceEye color={color} size={14} />} />)}
          </View>
        </View>;
      })}
      {!overview.wallets.length ? <AppText tone="secondary">No active wallets. Add one or restore an archived wallet below.</AppText> : null}
      {overview.archivedWallets.length ? <View style={{ gap: 16 }}>
        <AppText size={20} weight="600">Archived wallets</AppText>
        <AppText size={14} tone="secondary">Balances remain included in your total.</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          {overview.archivedWallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={walletLabel(wallet, [...overview.wallets, ...overview.archivedWallets])} compact={compact} onMenu={position => openMenu(wallet, position)} balanceToggle={color => <BalanceEye color={color} size={14} />} />)}
        </View>
      </View> : null}
      {menuWallet && anchor && !confirmArchive ? <AnchoredMenu anchor={anchor} onClose={() => { if (!busy) setMenuWallet(null); }}>
        {!menuWallet.archivedAt ? <Button label="Add money" icon="income" variant="quiet" disabled={busy || Boolean(storageError)} onPress={() => { const id = menuWallet.id; setMenuWallet(null); router.push({ pathname: '/expense', params: { mode: 'income', walletId: id, from: 'wallet' } }); }} /> : null}
        {!menuWallet.archivedAt && overview.wallets.length > 1 ? <Button label="Transfer" icon="transfer" variant="quiet" disabled={busy || Boolean(storageError)} onPress={() => { const id = menuWallet.id; setMenuWallet(null); router.push({ pathname: '/transfer', params: { walletId: id, from: 'wallet' } }); }} /> : null}
        <Button label="Edit name" icon="edit" variant="quiet" disabled={busy || Boolean(storageError)} onPress={() => { setRenameWallet(menuWallet); setMenuWallet(null); }} />
        <Button label="View history" icon="activity" variant="quiet" disabled={busy} onPress={() => { const id = menuWallet.id; setMenuWallet(null); router.push({ pathname: '/wallet-manage', params: { id } }); }} />
        <Button label={menuWallet.archivedAt ? 'Restore wallet' : 'Archive wallet'} icon={menuWallet.archivedAt ? 'restore' : 'archive'} variant="quiet" danger={!menuWallet.archivedAt} disabled={busy || Boolean(storageError)} onPress={() => { if (menuWallet.archivedAt) void changeArchive(); else setConfirmArchive(true); }} />
        {menuError ? <Feedback error>{menuError}</Feedback> : null}
      </AnchoredMenu> : null}
      {renameWallet ? <RenameWalletModal wallet={renameWallet} onClose={() => setRenameWallet(null)} /> : null}
      <AppModal title="Archive this wallet?" visible={Boolean(menuWallet) && confirmArchive} onClose={() => { if (!busy) setMenuWallet(null); }}>
        <AppText weight="600">{menuWallet?.name}</AppText>
        {confirmArchive ? <>
          <AppText size={14} tone="secondary">Are you sure? Its history and balance stay in your totals. Restore it anytime to record new transactions.</AppText>
          <Button label="Confirm archive" busy={busy} disabled={Boolean(storageError)} onPress={() => { void changeArchive(); }} />
        </> : <Button label={menuWallet?.archivedAt ? 'Restore wallet' : 'Archive wallet'} disabled={busy || Boolean(storageError)} onPress={() => { if (menuWallet?.archivedAt) void changeArchive(); else setConfirmArchive(true); }} />}
        {menuError ? <Feedback error>{menuError}</Feedback> : null}
        <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => setMenuWallet(null)} />
      </AppModal>
    </View>
  </ScrollView>;
}
