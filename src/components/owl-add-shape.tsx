import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../design-system/theme';

// Chubby owl face (feathered tufts, cream heart face, outlined) with a plus, for the main Add action.
// Ears are exact mirror images; fur strokes are subtle so the plus stays the focus. Decorative only.
const HEAD = 'M5 2 Q9.6 4.2 12 6.6 Q13.4 6 14.4 7.4 Q17 9.2 19.5 10 C25 7.8 31 7 36 7 C41 7 47 7.8 52.5 10 Q55 9.2 57.6 7.4 Q58.6 6 60 6.6 Q62.4 4.2 67 2 Q66.8 5.2 66.2 7.6 Q67.4 8.8 66.4 11.6 Q66.2 14.2 64.6 16 Q68.6 17.4 67.6 20.4 Q70.4 22.2 69.4 25.6 Q71.4 28.2 70.2 32 Q71.4 34.6 70 37.6 Q70.4 40.6 68.6 42.8 Q68.2 46 66 47.6 Q64.8 50.6 62 51.4 Q60.2 54.2 57 54.4 Q54.6 56.6 51.2 56.4 Q48.4 58.2 44.8 57.6 Q40.6 59 36 58.2 Q31.4 59 27.2 57.6 Q23.6 58.2 20.8 56.4 Q17.4 56.6 15 54.4 Q11.8 54.2 10 51.4 Q7.2 50.6 6 47.6 Q3.8 46 3.4 42.8 Q1.6 40.6 2 37.6 Q0.6 34.6 1.8 32 Q0.6 28.2 2.6 25.6 Q1.6 22.2 4.4 20.4 Q3.4 17.4 7.4 16 Q5.8 14.2 5.6 11.6 Q4.6 8.8 5.8 7.6 Q5.2 5.2 5 2 Z';
const EAR_LEFT = 'M7 5.4 Q10.6 7.6 12.4 9.6 Q14 9.8 15.2 11.2 Q16.4 12.2 16.4 12.6 Q13.8 13 12.6 14.2 Q10.8 14.6 9.8 16 Q8.6 16.6 7.6 17.4 Q6.6 11.4 7 5.4 Z';
const EAR_RIGHT = 'M65 5.4 Q61.4 7.6 59.6 9.6 Q58 9.8 56.8 11.2 Q55.6 12.2 55.6 12.6 Q58.2 13 59.4 14.2 Q61.2 14.6 62.2 16 Q63.4 16.6 64.4 17.4 Q65.4 11.4 65 5.4 Z';
const FACE = 'M36 27.5 Q34.4 23.6 32.4 22.6 Q30.8 19.4 27.6 17.6 Q24.4 15.9 21 16.2 Q18.6 17 17.4 18.4 Q14.6 19 13.6 21.6 Q11.2 23.2 10.8 26.2 Q9 28.6 9.4 31.4 Q8 34 8.8 36.8 Q8.2 40 9.6 42.6 Q9.8 46 12.2 47.8 Q13.6 51 16.8 51.6 Q19 54.2 22.4 54 Q25.2 55.8 28.6 55.2 Q32.2 56.4 36 55.6 Q39.8 56.4 43.4 55.2 Q46.8 55.8 49.6 54 Q53 54.2 55.2 51.6 Q58.4 51 59.8 47.8 Q62.2 46 62.4 42.6 Q63.8 40 63.2 36.8 Q64 34 62.6 31.4 Q63 28.6 61.2 26.2 Q60.8 23.2 58.4 21.6 Q57.4 19 54.6 18.4 Q53.4 17 51 16.2 Q47.6 15.9 44.4 17.6 Q41.2 19.4 39.6 22.6 Q37.6 23.6 36 27.5 Z';
const FUR = 'M24 12.6 Q27 11.6 29.6 12.9 M42.4 12.9 Q45 11.6 48 12.6 M33 10.2 Q36 9.3 39 10.2 M5.6 28 Q7.2 30.2 6.8 32.6 M66.4 28 Q64.8 30.2 65.2 32.6';
const FACE_FUR = 'M15.2 37.5 Q16.8 39.8 16.2 42.2 M56.8 37.5 Q55.2 39.8 55.8 42.2 M29.5 50.4 Q32 52 34.2 51 M37.8 51 Q40 52 42.5 50.4';
const CREAM = '#F6E4C6';

export function OwlAddShape({ width = 70 }: { width?: number }) {
  const { colors, isDark } = useTheme();
  const line = isDark ? '#0F1722' : '#16202E';
  return <Svg width={width} height={width * 60 / 72} viewBox="0 0 72 60" accessible={false}>
    <Path d={HEAD} fill={colors.accent} stroke={line} strokeWidth={1.3} strokeLinejoin="round" />
    <Path d={EAR_LEFT} fill={CREAM} />
    <Path d={EAR_RIGHT} fill={CREAM} />
    <Path d={FUR} fill="none" stroke={isDark ? 'rgba(23,42,61,0.25)' : 'rgba(10,22,38,0.25)'} strokeWidth={1} strokeLinecap="round" />
    <Path d={FACE} fill={CREAM} />
    <Path d={FACE_FUR} fill="none" stroke="rgba(150,110,60,0.2)" strokeWidth={0.9} strokeLinecap="round" />
    <Path d="M36 32 V46 M29 39 H43" fill="none" stroke={isDark ? colors.onAccent : colors.accent} strokeWidth={5} strokeLinecap="round" />
  </Svg>;
}
