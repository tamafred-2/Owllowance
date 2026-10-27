import { HeaderActions } from '../../../components/header-actions';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import type { ActivityItem, HistoryFilter } from '../../../domain/ledger';
import { addDays, eventTime, monthStart, nextMonthStart } from '../../../domain/date';
import { transactionsCsv } from '../../../domain/csv';
import { AppText, Button, Chip, EmptyState, Feedback, FormField } from '../../../design-system/primitives';
import { useTheme } from '../../../design-system/theme';
import { TransactionRow } from '../../../components/transaction-row';
import { DateField } from '../../../components/date-field';
import { saveTextFile } from '../../../platform/files';
import { useTracker } from './tracker-context';
import { useTransactionOpener } from './transaction-opener';
import { SavedFeedback } from './saved-feedback';

const PAGE_SIZE = 25;
type Period = 'all' | 'month' | 'last' | 'custom';

function periodRange(period: Period, from: string, to: string): Pick<HistoryFilter, 'fromDate' | 'toDateExclusive'> {
  const today = eventTime().localDate;
  if (period === 'month') return { fromDate: monthStart(today), toDateExclusive: nextMonthStart(today) };
  if (period === 'last') { const start = monthStart(addDays(monthStart(today), -1)); return { fromDate: start, toDateExclusive: monthStart(today) }; }
  if (period === 'custom') return { fromDate: from, toDateExclusive: addDays(to, 1) };
  return {};
}

export function ActivityScreen() {
  const { service, overview } = useTracker();
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const { colors } = useTheme();
  const opener = useTransactionOpener('history');
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<HistoryFilter['type']>();
  const [walletId, setWalletId] = useState<string>();
  const [categoryId, setCategoryId] = useState<string>();
  const [period, setPeriod] = useState<Period>('all');
  const today = eventTime().localDate;
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ text: string; error: boolean } | null>(null);
  const generation = useRef(0);
  const offset = useRef(0);
  const inFlight = useRef(false);
  // Search waits for a short pause in typing.
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 300); return () => clearTimeout(timer); }, [search]);
  const filter: HistoryFilter = { type, walletId, categoryId, search: query || undefined, ...periodRange(period, from, to > from ? to : from) };
  const filterKey = JSON.stringify(filter);
  const active = Boolean(type || walletId || categoryId || query || period !== 'all');

  const load = useCallback(async (reset = false) => {
    if (!service || (inFlight.current && !reset)) return;
    const current = ++generation.current;
    inFlight.current = true; setLoading(true); setError(false);
    const start = reset ? 0 : offset.current;
    try {
      const result = await service.repository.history(start, PAGE_SIZE + 1, JSON.parse(filterKey) as HistoryFilter);
      if (current !== generation.current) return;
      const page = result.slice(0, PAGE_SIZE);
      setItems(previous => reset ? page : [...previous, ...page]);
      offset.current = start + page.length;
      setHasMore(result.length > PAGE_SIZE);
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { inFlight.current = false; setLoading(false); } }
  }, [service, filterKey]);

  const cancel = useCallback(() => { generation.current++; inFlight.current = false; }, []);
  useEffect(() => { void load(true); return cancel; }, [load, overview, cancel]);

  async function exportCsv() {
    if (!service || exporting) return;
    setExporting(true); setExportMessage(null);
    try {
      // Everything matching the current filter; a transfer is one row naming both wallets and its fee is its own expense row.
      const base: HistoryFilter = { ...JSON.parse(filterKey), separateFees: true };
      const rows: ActivityItem[] = [];
      for (let start = 0; ; start += 100) {
        const page = await service.repository.history(start, 100, base);
        rows.push(...page);
        if (page.length < 100) break;
      }
      await saveTextFile(`owllowance-transactions-${today}.csv`, transactionsCsv(rows), 'text/csv');
      setExportMessage({ text: `Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}.`, error: false });
    } catch (failure) { setExportMessage({ text: failure instanceof Error ? failure.message : 'Could not export.', error: true }); }
    finally { setExporting(false); }
  }

  const categories = type === 'income' ? overview?.incomeCategories ?? [] : type === 'expense' ? overview?.categories ?? [] : [...(overview?.categories ?? []), ...(overview?.incomeCategories ?? [])];
  const wallets = [...(overview?.wallets ?? []), ...(overview?.archivedWallets ?? [])];
  const header = <View style={{ gap: 12, paddingBottom: 8 }}>
    <SavedFeedback saved={saved} />
    <FormField label="Search" placeholder="Note, category or wallet" value={search} onChangeText={setSearch} maxLength={100} returnKeyType="search" />
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Chip label={showFilters ? 'Hide filters' : active ? 'Filters on' : 'Filters'} icon="filter" selected={active} onPress={() => setShowFilters(value => !value)} />
      {active ? <Chip label="Clear" icon="close" selected={false} onPress={() => { setType(undefined); setWalletId(undefined); setCategoryId(undefined); setSearch(''); setQuery(''); setPeriod('all'); }} /> : null}
      <Chip label={exporting ? 'Exporting…' : 'Export CSV'} icon="download" selected={false} disabled={exporting} onPress={() => { void exportCsv(); }} />
    </View>
    {exportMessage ? <Feedback error={exportMessage.error}>{exportMessage.text}</Feedback> : null}
    {showFilters ? <View testID="history-filters" style={{ gap: 12 }}>
      <AppText size={13} weight="600" tone="secondary">Type</AppText>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {([[undefined, 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']] as const).map(([value, label]) =>
          <Chip key={label} label={label} selected={type === value} onPress={() => { setType(value); setCategoryId(undefined); }} />)}
      </View>
      <AppText size={13} weight="600" tone="secondary">Date</AppText>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {([['all', 'All time'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Custom']] as const).map(([value, label]) =>
          <Chip key={value} label={label} selected={period === value} onPress={() => setPeriod(value)} />)}
      </View>
      {period === 'custom' ? <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 150 }}><DateField label="From" value={from} onChange={setFrom} max={today} /></View>
        <View style={{ flex: 1, minWidth: 150 }}><DateField label="To" value={to} onChange={setTo} max={today} /></View>
      </View> : null}
      <AppText size={13} weight="600" tone="secondary">Wallet</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All wallets" selected={!walletId} onPress={() => setWalletId(undefined)} />
        {wallets.map(wallet => <Chip key={wallet.id} label={wallet.name} selected={walletId === wallet.id} onPress={() => setWalletId(wallet.id)} />)}
      </ScrollView>
      {type !== 'transfer' ? <>
        <AppText size={13} weight="600" tone="secondary">Category</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All categories" selected={!categoryId} onPress={() => setCategoryId(undefined)} />
          {categories.map(category => <Chip key={category.id} label={category.name} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)} />)}
        </ScrollView>
      </> : null}
    </View> : null}
  </View>;

  return <View style={{ flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 24 }}>
    <View style={{ paddingTop: 28, paddingBottom: 12, gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><AppText accessibilityRole="header" size={28} weight="700" style={{ flexShrink: 1 }}>History</AppText><HeaderActions /></View><AppText tone="secondary">The story behind your balance.</AppText></View>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={items} keyExtractor={item => `${item.id}-${item.walletId}`}
      renderItem={({ item }) => <TransactionRow item={item} walletHistory={Boolean(walletId)} onPress={opener.open} />}
      ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }} initialNumToRender={15}
      ListEmptyComponent={!loading && !error ? active ? <EmptyState title="No matches" message="Try a different search or clear the filters." /> : <EmptyState title="Nothing recorded yet" message="Your opening balances, income and expenses will appear here." /> : null}
      ListFooterComponent={<View style={{ paddingVertical: 20, gap: 12 }}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <><Feedback error>Could not load activity. Your local records have not been changed.</Feedback><Button label="Retry activity" variant="secondary" onPress={() => { void load(items.length === 0); }} /></> : null}
        {hasMore && !error ? <Button label="Load more activity" variant="secondary" disabled={loading} onPress={() => { void load(); }} /> : null}
      </View>} />
    {opener.modal}
  </View>;
}
