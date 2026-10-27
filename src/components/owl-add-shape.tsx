import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppIcon } from '../design-system/icon';
import { useTheme } from '../design-system/theme';

// Owl head silhouette (round face, two ear tufts) for the main Add action; decorative only.
const OWL_HEAD = 'M9.5 26 L9 6.5 Q9.4 3.6 12 5 L24.5 14 Q32 11.5 39.5 14 L52 5 Q54.6 3.6 55 6.5 L54.5 26 C58.5 32 58.5 39.5 56.4 45.5 C52.5 56 43 62 32 62 C21 62 11.5 56 7.6 45.5 C5.5 39.5 5.5 32 9.5 26 Z';

export function OwlAddShape({ size = 60 }: { size?: number }) {
  const { colors } = useTheme();
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }} accessible={false}>
      <Path d={OWL_HEAD} fill={colors.accent} />
    </Svg>
    {/* Centred on the face, below the ear tufts. */}
    <View style={{ marginTop: size * 0.22 }}><AppIcon name="add" color={colors.onAccent} size={Math.round(size * 0.43)} /></View>
  </View>;
}
