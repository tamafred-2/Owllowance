import { AnchoredMenu, type MenuAnchor } from '../../../components/anchored-menu';
import { AppModal } from '../../../components/app-modal';
import { HeaderActions } from '../../../components/header-actions';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText, Button, Feedback, MoneyText, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { forestSummaryColors, useTheme } from '../../../design-system/theme';
import { NET_WORTH, type Wallet, type WalletKind } from '../../../domain/ledger';
import { WalletCard } from '../../../components/wallet-card';
import { WalletDeck, WalletRow } from '../../../components/wallet-views';
import { ForestScene } from '../../../components/forest-scene';
import { useTracker } from './tracker-context';
import { usePullToRefresh } from './pull-to-refresh';
import { SavedFeedback } from './saved-feedback';
import { walletLabel } from '../../../design-system/wallet-appearance';
import { WalletSetup } from './wallet-setup';
import { RenameWalletModal } from './rename-wallet-modal';
import { BalanceEye } from './balance-eye';

// The card left in front survives leaving the screen (memory) and restarts (settings).
let lastDeckWallet: string | null = null;

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
  const [deckDragging, setDeckDragging] = useState(false);
  // Off while a finger is on the card deck, so dragging a card down never starts a refresh.
  const refreshControl = usePullToRefresh(undefined, !deckDragging);
  const rememberDeckWallet = useCallback((walletId: string) => {
    lastDeckWallet = walletId;
    void service?.repository.saveSettings({ deckWallet: walletId }).catch(() => undefined);
  }, [service]);
  if (!overview) return null;
  const view = overview.settings.walletView;
  const allWallets = [...overview.wallets, ...overview.archivedWallets];
  const viewProps = {
    label: (wallet: Wallet) => walletLabel(wallet, allWallets),
    onMenu: (wallet: Wallet, position: MenuAnchor) => openMenu(wallet, position),
    hidden: (wallet: Wallet) => overview.settings.hiddenBalances.includes(wallet.id),
    balanceToggle: (wallet: Wallet, color: string, size = 18) => <BalanceEye target={wallet.id} color={color} size={size} />,
  };
  if (!overview.wallet && !overview.archivedWallets.length) return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}><WalletSetup /></ScrollView>;
  return <ScrollView refreshControl={refreshControl} scrollEnabled={!deckDragging} showsVerticalScrollIndicator={false} onScroll={event => setSceneVisible(event.nativeEvent.contentOffset.y < 300)} scrollEventThrottle={100}
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
                <BalanceEye target={NET_WORTH} color={palette.secondary} size={16} />
              </View>
              <MoneyText value={overview.totalBalanceMinor} size={24} fit hidden={overview.settings.hiddenBalances.includes(NET_WORTH)} style={{ color: palette.text }} />
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -8 }}>
      <AppText testID="wallet-view-label" size={13} weight="600" tone="secondary">{{ list: 'List view', grid: 'Grid view', cards: 'Card view' }[view]}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Wallet view" style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: colors.muted }}>
        {([['list', 'viewList', 'List view'], ['grid', 'viewGrid', 'Grid view'], ['cards', 'viewCards', 'Card view']] as const).map(([value, icon, name]) =>
          <Pressable key={value} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ checked: view === value }} aria-checked={view === value}
            onPress={() => { if (view !== value && service) void service.repository.saveSettings({ walletView: value }).then(refresh, () => undefined); }}
            style={{ width: 40, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: view === value ? colors.surface : 'transparent' }}>
            <AppIcon name={icon} size={18} color={view === value ? colors.accent : colors.textSecondary} />
          </Pressable>)}
      </View>
      </View>
      {view === 'cards' ? <WalletDeck wallets={overview.wallets} onDragChange={setDeckDragging} initialWalletId={lastDeckWallet ?? overview.settings.deckWallet} onFrontChange={rememberDeckWallet}
        onOpen={wallet => router.push({ pathname: '/wallet-manage', params: { id: wallet.id } })} {...viewProps} /> : (['cash', 'ewallet', 'bank'] as WalletKind[]).map(kind => {
        const wallets = overview.wallets.filter(wallet => wallet.kind === kind);
        if (!wallets.length) return null;
        return <View key={kind} style={{ gap: view === 'list' ? 4 : 12 }}>
          <AppText size={14} weight="600" tone="secondary">{{ cash: 'Cash', ewallet: 'E-wallets', bank: 'Bank accounts' }[kind]}</AppText>
          {view === 'list' ? <View>{wallets.map(wallet => <WalletRow key={wallet.id} wallet={wallet} {...viewProps} />)}</View> :
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            {wallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={viewProps.label(wallet)} compact={compact} onMenu={position => openMenu(wallet, position)} hidden={viewProps.hidden(wallet)} balanceToggle={color => viewProps.balanceToggle(wallet, color, 18)} />)}
          </View>}
        </View>;
      })}
      {!overview.wallets.length ? <AppText tone="secondary">No active wallets. Add one or restore an archived wallet below.</AppText> : null}
      {overview.archivedWallets.length ? <View style={{ gap: 16 }}>
        <AppText size={20} weight="600">Archived wallets</AppText>
        <AppText size={14} tone="secondary">Balances remain included in your total.</AppText>
        {view === 'grid' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          {overview.archivedWallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} label={viewProps.label(wallet)} compact={compact} onMenu={position => openMenu(wallet, position)} hidden={viewProps.hidden(wallet)} balanceToggle={color => viewProps.balanceToggle(wallet, color, 18)} />)}
        </View> : <View>{overview.archivedWallets.map(wallet => <WalletRow key={wallet.id} wallet={wallet} {...viewProps} />)}</View>}
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
