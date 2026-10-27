import { useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSheetFrame } from './sheet-context';

// Inside a sheet: while scrolled to the very top, pulling down drags the sheet (to close) and
// pushing up scrolls the content by hand; once scrolled, the content scrolls natively.
// Native scrolling is paused at the top so Android's scroll view can't claim the pull first.
export function SheetScrollView({ children, ...props }: ScrollViewProps) {
  const frame = useSheetFrame();
  const scrollRef = useRef<ScrollView>(null);
  const [atTop, setAtTop] = useState(true);
  // The handlers use scrollRef only while a gesture runs, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => atTop && Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => {
      if (gesture.dy >= 0) frame?.dragMove(gesture.dy);
      else { frame?.dragMove(0); scrollRef.current?.scrollTo({ y: -gesture.dy, animated: false }); }
    },
    onPanResponderRelease: (_, gesture) => {
      frame?.dragEnd(Math.max(0, gesture.dy), gesture.vy);
      if (gesture.dy < -2) setAtTop(false);
    },
    onPanResponderTerminate: () => frame?.dragEnd(0, 0),
    onPanResponderTerminationRequest: () => false,
  }), [atTop, frame]);
  if (!frame) return <ScrollView {...props}>{children}</ScrollView>;
  return <View style={{ flex: 1 }} {...responder.panHandlers}>
    <ScrollView ref={scrollRef} {...props} scrollEnabled={!atTop} scrollEventThrottle={16}
      onScroll={event => { const top = event.nativeEvent.contentOffset.y <= 0; if (top !== atTop) setAtTop(top); }}>{children}</ScrollView>
  </View>;
}
