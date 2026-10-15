import { Link } from 'expo-router';
import { View } from 'react-native';
import { AppText } from '../src/design-system/primitives';

export default function NotFound() {
  return <View style={{ padding: 32, gap: 16 }}><AppText size={24}>Page not found</AppText><Link href="/">Return to Home</Link></View>;
}
