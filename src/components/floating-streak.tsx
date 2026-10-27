import { useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { AppModal } from './app-modal';
import { AppText, Button } from '../design-system/primitives';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';
import type { Streak } from '../domain/ledger';

const WIDTH = 66;
const HEIGHT = 40;
const MARGIN = 12;

// A tap (barely moved) opens the streak; anything more is a drag.
function createController(onTap: () => void) {
  const position = new Animated.ValueXY({ x: 20, y: 20 });
  let point = { x: 20, y: 20 };
  let origin = { x: 20, y: 20 };
  let bounds = { width: 0, height: 0 };
  const move = (x: number, y: number) => {
    const clamp = (value: number, extent: number, size: number) => Math.max(MARGIN, Math.min(value, Math.max(MARGIN, extent - size - MARGIN)));
    point = { x: clamp(x, bounds.width, WIDTH), y: clamp(y, bounds.height, HEIGHT) };
    position.setValue(point);
  };
  let userMoved = false;
  // Rests in the bottom corner, where scrolling moves content out from under it.
  const reset = () => move(bounds.width - WIDTH - 16, bounds.height - HEIGHT - 16);
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { origin = { ...point }; },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) return;
      userMoved = true; move(origin.x + gesture.dx, origin.y + gesture.dy);
    },
    onPanResponderRelease: (_, gesture) => { if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) onTap(); },
    onPanResponderTerminationRequest: () => false,
  });
  return {
    position, responder,
    layout: (size: { width: number; height: number }) => { bounds = size; if (userMoved) move(point.x, point.y); else reset(); },
    action: (action: string) => {
      if (action === 'reset') { userMoved = false; reset(); }
      else { userMoved = true; move(point.x + (action === 'increment' ? 40 : action === 'decrement' ? -40 : 0), point.y + (action === 'down' ? 40 : action === 'up' ? -40 : 0)); }
    },
  };
}

function streakMessage(streak: Streak): string {
  if (streak.loggedToday) return 'You recorded something today. See you tomorrow.';
  if (streak.current) return 'Record anything today to keep it going.';
  return 'Record an expense, income or transfer to start a streak.';
}

// Days in a row with something recorded. Drag to move it; tap to see it.
export function FloatingStreak({ streak }: { streak: Streak }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [controller] = useState(() => createController(() => setOpen(true)));
  const [positioned, setPositioned] = useState(false);
  const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
  return <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 }} onLayout={event => {
    const size = event.nativeEvent.layout;
    if (size.width <= 0 || size.height <= 0) return;
    controller.layout(size);
    setPositioned(true);
  }}>
    <Animated.View {...controller.responder.panHandlers} testID="floating-streak" accessible accessibilityRole="adjustable"
      accessibilityLabel={`Streak: ${days(streak.current)}`} accessibilityHint="Opens your streak. Drag to move."
      accessibilityActions={[{ name: 'activate', label: 'Open streak' }, { name: 'increment', label: 'Move right' }, { name: 'decrement', label: 'Move left' }, { name: 'up', label: 'Move up' }, { name: 'down', label: 'Move down' }, { name: 'reset', label: 'Reset position' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') setOpen(true); else controller.action(event.nativeEvent.actionName); }}
      pointerEvents={positioned ? 'auto' : 'none'} accessibilityElementsHidden={!positioned} importantForAccessibility={positioned ? 'auto' : 'no-hide-descendants'}
      style={{ opacity: positioned ? 1 : 0, position: 'absolute', left: 0, top: 0, transform: controller.position.getTranslateTransform(), width: WIDTH, height: HEIGHT,
        borderRadius: HEIGHT / 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 4,
        alignItems: 'center', justifyContent: 'center', elevation: 4, boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.12)', touchAction: 'none' }}>
      <AppIcon name="streak" size={20} color={streak.loggedToday ? colors.accent : colors.textSecondary} />
      <AppText size={15} weight="700" style={{ color: streak.loggedToday ? colors.accent : colors.textSecondary }}>{streak.current}</AppText>
    </Animated.View>
    {open ? <AppModal title="Streak" visible onClose={() => setOpen(false)}>
      <View testID="streak-details" style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
        <AppIcon name="streak" size={36} color={colors.accent} />
        <AppText size={28} weight="700">{days(streak.current)}</AppText>
        <AppText size={14} tone="secondary" style={{ textAlign: 'center' }}>{streakMessage(streak)}</AppText>
        {streak.best > streak.current ? <AppText size={13} tone="secondary">{`Best: ${days(streak.best)}`}</AppText> : null}
      </View>
      <Button label="Close" variant="quiet" onPress={() => setOpen(false)} />
    </AppModal> : null}
  </View>;
}
