import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useTheme } from '../../../design-system/theme';
import { useTracker } from './tracker-context';

// Pull down to re-read local data; `extra` reloads screen-specific lists afterwards.
export function usePullToRefresh(extra?: () => Promise<void> | void) {
  const { refresh } = useTracker();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); await extra?.(); }
    finally { setRefreshing(false); }
  }, [refresh, extra]);
  return <RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh(); }}
    colors={[colors.accent]} tintColor={colors.accent} progressBackgroundColor={colors.surface} />;
}
