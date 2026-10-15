import { HeaderActions } from '../../../components/header-actions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { ActivityItem } from '../../../domain/ledger';
import { AppText, Button, EmptyState, Feedback } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { TransactionRow } from '../../../components/transaction-row';
import { useTracker } from './tracker-context';

const PAGE_SIZE = 25;
export function ActivityScreen() {
  const { service, overview } = useTracker();
  const { colors } = useTheme();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const offset = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (reset = false) => {
    if (!service || (inFlight.current && !reset)) return;
    const current = ++generation.current;
    inFlight.current = true; setLoading(true); setError(false);
    const start = reset ? 0 : offset.current;
    try {
      const result = await service.repository.history(start, PAGE_SIZE + 1);
      if (current !== generation.current) return;
      const page = result.slice(0, PAGE_SIZE);
      setItems(previous => reset ? page : [...previous, ...page]);
      offset.current = start + page.length;
      setHasMore(result.length > PAGE_SIZE);
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { inFlight.current = false; setLoading(false); } }
  }, [service]);

  const cancel = useCallback(() => { generation.current++; inFlight.current = false; }, []);
  useEffect(() => { void load(true); return cancel; }, [load, overview, cancel]);
  return <View style={{ flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 24 }}>
    <View style={{ paddingVertical: 28, gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><AppText accessibilityRole="header" size={28} weight="700" style={{ flexShrink: 1 }}>History</AppText><HeaderActions /></View><AppText tone="secondary">The story behind your balance.</AppText></View>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={items} keyExtractor={item => item.id} renderItem={({ item }) => <TransactionRow item={item} />}
      contentContainerStyle={{ paddingBottom: 24 }} initialNumToRender={15}
      ListEmptyComponent={!loading && !error ? <EmptyState title="Nothing recorded yet" message="Your opening balances, income and expenses will appear here." /> : null}
      ListFooterComponent={<View style={{ paddingVertical: 20, gap: 12 }}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <><Feedback error>Could not load activity. Your local records have not been changed.</Feedback><Button label="Retry activity" variant="secondary" onPress={() => { void load(items.length === 0); }} /></> : null}
        {hasMore && !error ? <Button label="Load more activity" variant="secondary" disabled={loading} onPress={() => { void load(); }} /> : null}
      </View>} />
  </View>;
}
