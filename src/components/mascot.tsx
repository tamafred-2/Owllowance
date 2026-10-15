import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { artwork } from '../design-system/artwork';
import { useTheme } from '../design-system/theme';

export function Mascot({ night, animate, size }: { night: boolean; animate: boolean; size: number }) {
  const { colors } = useTheme();
  const [reaction, setReaction] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reactionReady, setReactionReady] = useState(false);

  const playing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const still = night ? artwork.owl.night : artwork.owl.day;
  const idle = night && animate && !failed ? artwork.owl.nightIdle : still;
  const tap = night ? animate ? artwork.owl.nightTap : artwork.owl.nightTapStill :
    animate ? artwork.owl.dayTap : artwork.owl.dayTapStill;
  function finish() {
    if (timer.current) clearTimeout(timer.current);
    playing.current = false;
    setReactionReady(false);
    setReaction(false);
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={night ? 'Greet the owl' : 'Gently wake the owl'}
    accessibilityHint="The owl reacts, then returns to resting." testID="dashboard-owl"
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}

    onPress={() => {
      if (playing.current) return;
      playing.current = true;
      setReaction(true);
      timer.current = setTimeout(finish, 4000);
    }}
    style={{ width: size, height: size * 450 / 440, minWidth: 48, minHeight: 48,
      borderRadius: 20, outlineColor: colors.accent, outlineWidth: focused ? 3 : 0, outlineStyle: 'solid' }}>
    <View pointerEvents="none" style={{ flex: 1 }}>
      {/* Keep the decoded resting image mounted throughout every reaction. */}
      <View style={[StyleSheet.absoluteFill, { opacity: reactionReady ? 0 : 1 }]}>
        <Image source={idle} defaultSource={still} resizeMode="contain" fadeDuration={0} accessible={false} aria-hidden
          testID="owl-idle" style={{ width: '100%', height: '100%' }} onError={() => setFailed(true)} />
      </View>
      {reaction ? <View style={[StyleSheet.absoluteFill, { opacity: reactionReady ? 1 : 0 }]}>
        <Image source={tap} resizeMode="contain" fadeDuration={0} accessible={false} aria-hidden
          testID="owl-reaction" style={{ width: '100%', height: '100%' }}
          onError={finish}
          onLoad={() => {
            if (timer.current) clearTimeout(timer.current);
            setReactionReady(true);
            timer.current = setTimeout(finish, animate ? night ? 1500 : 2200 : 1100);
          }} />
      </View> : null}
    </View>
  </Pressable>;
}
