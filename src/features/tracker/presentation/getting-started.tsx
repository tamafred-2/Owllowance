import { useRef, useState } from 'react';
import { Image, ImageBackground, Modal, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { artwork, forestScenes, type ForestSceneName } from '../../../design-system/artwork';
import { useTracker } from './tracker-context';

type Card = { scene: ForestSceneName; title: string; body: string };
// Each step uses one of the supplied forest scenes with the matching day/night owl.
const cards: Card[] = [
  { scene: 'sunrise', title: 'Welcome to Owllowance', body: 'A calm place for your allowance, salary and spending. Here is the quick tour.' },
  { scene: 'morning', title: 'Your wallets', body: 'Add cash, e-wallets and bank accounts on Wallet. Tap a card’s ⋮ for Add money, Transfer and more. The eye hides a balance.' },
  { scene: 'noon', title: 'Add with the owl', body: 'Tap the owl button to add an expense, or switch to Income. Drag the sheet down to close it.' },
  { scene: 'dusk', title: 'Plan ahead', body: 'Set budgets and recurring bills on Plan. Due items appear on Home with Paid and Skip. Tap the bell to turn on reminders.' },
  { scene: 'night', title: 'Look back and keep it safe', body: 'History has search, filters and CSV. Insights shows where your money goes. Export a backup in Settings now and then.' },
];

export function GettingStarted({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);
  const last = page === cards.length - 1;
  // While a button-driven slide runs, scroll events still report the old card; ignore them.
  const sliding = useRef(false);
  const go = (index: number) => {
    sliding.current = true;
    setTimeout(() => { sliding.current = false; }, 450);
    setPage(index);
    pager.current?.scrollTo({ x: index * width, animated: true });
  };
  // Only settle the page when the pager rests on a card, not mid-slide.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (sliding.current) return;
    const position = event.nativeEvent.contentOffset.x / width;
    const index = Math.round(position);
    if (Math.abs(position - index) < 0.02 && index !== page && index >= 0 && index < cards.length) setPage(index);
  };
  const artHeight = Math.round(height * 0.52);
  return <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onDone}>
    <View testID="getting-started" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={onScroll} scrollEventThrottle={64}>
        {cards.map((card, index) => {
          const scene = forestScenes[card.scene];
          return <View key={card.scene} style={{ width, flex: 1 }} accessible accessibilityLabel={`Step ${index + 1} of ${cards.length}. ${card.title}. ${card.body}`}>
            <ImageBackground source={scene.image} resizeMode="cover" style={{ height: artHeight, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 18 }}>
              <Image source={scene.night ? artwork.owl.night : artwork.owl.day} accessible={false} resizeMode="contain" style={{ width: 132, height: 132 }} />
            </ImageBackground>
            <View style={{ flex: 1, marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, paddingHorizontal: 28, paddingTop: 28, gap: 12 }}>
              <AppText size={12} weight="600" tone="secondary" style={{ letterSpacing: 1 }}>{`STEP ${index + 1} OF ${cards.length}`}</AppText>
              <AppText accessibilityRole="header" size={26} weight="700">{card.title}</AppText>
              <AppText size={16} tone="secondary" style={{ lineHeight: 24 }}>{card.body}</AppText>
            </View>
          </View>;
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 16 }}>
        <View accessible={false} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {cards.map((card, index) => <View key={card.scene} style={{ width: index === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: index === page ? colors.accent : colors.border }} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {!last ? <View style={{ flex: 1 }}><Button label="Skip guide" variant="quiet" onPress={onDone} /></View> : null}
          <View style={{ flex: 1 }}><Button label={last ? 'Get started' : 'Next'} onPress={() => last ? onDone() : go(page + 1)} /></View>
        </View>
      </View>
    </View>
  </Modal>;
}

// Shows the guide once, after the first wallet exists; finishing or skipping remembers it.
export function GettingStartedGate() {
  const { service, overview, refresh } = useTracker();
  const [closed, setClosed] = useState(false);
  const ready = overview && (overview.wallet || overview.archivedWallets.length) && !overview.settings.guideSeen && !closed;
  if (!ready) return null;
  return <GettingStarted onDone={() => {
    setClosed(true);
    void service?.repository.saveSettings({ guideSeen: true }).then(refresh, () => undefined);
  }} />;
}
