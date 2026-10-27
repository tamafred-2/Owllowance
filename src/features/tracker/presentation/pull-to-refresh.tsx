import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useTheme } from '../../../design-system/theme';
import { useTracker } from './tracker-context';

// Pull down to re-read local data; `extra` reloads screen-specific lists afterwards.
// `enabled: false` hands downward drags to something else on the page (the wallet card deck).
export function usePullToRefresh(extra?: () => Promise<void> | void, enabled = true) {
  const { refresh } = useTracker();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); await extra?.(); }
    finally { setRefreshing(false); }
  }, [refresh, extra]);
  return <RefreshControl refreshing={refreshing} enabled={enabled} onRefresh={() => { void onRefresh(); }}
    colors={[colors.accent]} tintColor={colors.accent} progressBackgroundColor={colors.surface} />;
}
