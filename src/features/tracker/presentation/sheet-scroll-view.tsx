import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { useSheetFrame } from './sheet-context';

// Inside a sheet, the sheet's own scroll view: scrolling back to the top and pulling on drags the sheet closed.
export function SheetScrollView({ children, ...props }: ScrollViewProps) {
  const frame = useSheetFrame();
  if (!frame) return <ScrollView {...props}>{children}</ScrollView>;
  return <BottomSheetScrollView {...props}>{children}</BottomSheetScrollView>;
}
