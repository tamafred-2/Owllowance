import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ActivityItem } from '../../../domain/ledger';
import { AppText, Button, Feedback, Surface } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { TransactionRow } from '../../../components/transaction-row';
import { useTracker } from './tracker-context';
import { useTransactionOpener } from './transaction-opener';

const PAGE_SIZE = 10;

export function WalletHistory({ walletId }: { walletId: string }) {
  const { service, overview } = useTracker();
  const { colors } = useTheme();
  const opener = useTransactionOpener('manage', walletId);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
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
      const result = await service.repository.history(start, PAGE_SIZE + 1, walletId);
      if (current !== generation.current) return;
      const page = result.slice(0, PAGE_SIZE);
      setItems(previous => reset ? page : [...previous, ...page]);
      offset.current = start + page.length;
      setHasMore(result.length > PAGE_SIZE);
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { inFlight.current = false; setLoading(false); } }
  }, [service, walletId]);

  const cancel = useCallback(() => { generation.current++; inFlight.current = false; }, []);
  useEffect(() => {
    void load(true);
    return cancel;
  }, [load, overview, cancel]);

  return <Surface style={{ gap: 8 }}>
    <AppText accessibilityRole="header" size={20} weight="600">Wallet history</AppText>
    <AppText size={14} tone="secondary">Cash in and out of this wallet.</AppText>
    <View testID="wallet-history">
      {items.map(item => <TransactionRow key={item.id} item={item} walletHistory onPress={opener.open} />)}
    </View>
    {!items.length && !loading && !error ? <AppText tone="secondary">No transactions yet.</AppText> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Loading wallet history" color={colors.accent} /> : null}
    {error ? <><Feedback error>Could not load wallet history.</Feedback><Button label="Retry wallet history" variant="secondary" onPress={() => { void load(items.length === 0); }} /></> : null}
    {hasMore && !error ? <Button label="Load more" variant="secondary" disabled={loading} onPress={() => { void load(); }} /> : null}
    {opener.modal}
  </Surface>;
}
