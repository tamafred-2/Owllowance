import { usePathname } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { forestSceneAt, forestScenes } from '../design-system/artwork';
import { radius, useTheme } from '../design-system/theme';
import { Mascot } from './mascot';
import { useActiveMotion } from './use-active-motion';

export function ForestScene({ visible = true, children }: { visible?: boolean; children?: ReactNode | ((scene: { night: boolean }) => ReactNode) }) {
  const path = usePathname();
  const { colors } = useTheme();
  const { active, animate } = useActiveMotion((path === '/accounts' || path === '/') && visible);
  const [sceneName, setSceneName] = useState(() => forestSceneAt(new Date()));
  const [width, setWidth] = useState(0);
  const [loadedScene, setLoadedScene] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const update = () => setSceneName(forestSceneAt(new Date()));
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [active]);
  const scene = forestScenes[sceneName];
  // Mirror the forest to bring its perch left; keep the owl itself facing normally.
  const owlCenter = width >= 700 ? 128 : 74;
  const canvasWidth = Math.max((width - owlCenter) / 0.76, 600);
  const canvasHeight = canvasWidth * 941 / 1672;
  const height = width >= 700 ? 190 : 150;
  const owlSize = width >= 700 ? 96 : 84;
  const perchY = height * 0.9;
  return <View testID="forest-scene" onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={{ height, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.muted }}>
    {width > 0 ? <View style={{ position: 'absolute', left: owlCenter - canvasWidth * 0.24, top: perchY - canvasHeight * 0.71, width: canvasWidth, height: canvasHeight }}>
      <Image source={scene.image} style={[StyleSheet.absoluteFill, { width: canvasWidth, height: canvasHeight, transform: [{ scaleX: -1 }] }]} resizeMode="stretch" fadeDuration={0}
        onLoad={() => setLoadedScene(sceneName)}
        accessible={false} aria-hidden testID={`forest-${sceneName}`} />
      <View style={{ position: 'absolute', left: canvasWidth * 0.24 - owlSize / 2, bottom: '29%', opacity: loadedScene === sceneName ? 1 : 0 }} pointerEvents={loadedScene === sceneName ? 'auto' : 'none'} accessibilityElementsHidden={loadedScene !== sceneName} importantForAccessibility={loadedScene === sceneName ? 'auto' : 'no-hide-descendants'}>
        <Mascot key={`${sceneName}-${active}-${animate}`} night={scene.night} animate={animate} size={owlSize} />
      </View>
    </View> : null}
    {children ? <View style={{ flex: 1, justifyContent: 'center', marginLeft: width >= 700 ? 196 : 128, marginRight: 16, paddingVertical: 12 }}>{typeof children === 'function' ? children({ night: scene.night }) : children}</View> : null}
  </View>;
}
