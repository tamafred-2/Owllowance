import { useState } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';

const SIZE = 48;
const MARGIN = 12;

function createController() {
  const position = new Animated.ValueXY({ x: 20, y: 20 });
  let point = { x: 20, y: 20 };
  let origin = { x: 20, y: 20 };
  let bounds = { width: 0, height: 0 };
  const move = (x: number, y: number) => {
    const clamp = (value: number, extent: number) => Math.max(MARGIN, Math.min(value, Math.max(MARGIN, extent - SIZE - MARGIN)));
    point = { x: clamp(x, bounds.width), y: clamp(y, bounds.height) };
    position.setValue(point);
  };
  let userMoved = false;
  const reset = () => move(bounds.width - SIZE - 20, bounds.height * 0.72 - SIZE / 2);
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { userMoved = true; origin = { ...point }; },
    onPanResponderMove: (_, gesture) => move(origin.x + gesture.dx, origin.y + gesture.dy),
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

// Only the position is interactive; streak counting is still a future feature.
export function FloatingStreak() {
  const { colors } = useTheme();
  const [controller] = useState(createController);
  const [positioned, setPositioned] = useState(false);
  return <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 }} onLayout={event => {
    const size = event.nativeEvent.layout;
    if (size.width <= 0 || size.height <= 0) return;
    controller.layout(size);
    setPositioned(true);
  }}>
    <Animated.View {...controller.responder.panHandlers} testID="floating-streak" accessible accessibilityRole="adjustable"
      accessibilityLabel="Streak, coming soon" accessibilityHint="Drag to move. Streak tracking is not available yet."
      accessibilityActions={[{ name: 'increment', label: 'Move right' }, { name: 'decrement', label: 'Move left' }, { name: 'up', label: 'Move up' }, { name: 'down', label: 'Move down' }, { name: 'reset', label: 'Reset position' }]}
      onAccessibilityAction={event => controller.action(event.nativeEvent.actionName)}
      pointerEvents={positioned ? 'auto' : 'none'} accessibilityElementsHidden={!positioned} importantForAccessibility={positioned ? 'auto' : 'no-hide-descendants'}
      style={{ opacity: positioned ? 1 : 0, position: 'absolute', left: 0, top: 0, transform: controller.position.getTranslateTransform(), width: SIZE, height: SIZE,
        borderRadius: SIZE / 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        alignItems: 'center', justifyContent: 'center', elevation: 4, boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.12)', touchAction: 'none' }}>
      <AppIcon name="streak" size={24} color={colors.accent} />
    </Animated.View>
  </View>;
}
