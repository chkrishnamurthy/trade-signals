import type { WatchlistRow } from '@equitywise/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MarketStatus } from '@/components/MarketStatus';
import { Prompt } from '@/components/Prompt';
import { QuoteRow } from '@/components/QuoteRow';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { istTime } from '@/lib/format';
import { keys, useRemoveFromWatchlist, useWatchlist } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

type Sort = 'list' | 'gainers' | 'losers' | 'name';

const SORTS: ReadonlyArray<{ id: Sort; label: string }> = [
  { id: 'list', label: 'My order' },
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
  { id: 'name', label: 'A–Z' },
];

function sorted(rows: readonly WatchlistRow[], sort: Sort): WatchlistRow[] {
  const copy = [...rows];
  const pct = (r: WatchlistRow) => r.changePercent ?? Number.NEGATIVE_INFINITY;
  if (sort === 'gainers') copy.sort((a, b) => pct(b) - pct(a));
  if (sort === 'losers')
    copy.sort((a, b) => (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity));
  if (sort === 'name') copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return copy;
}

export default function WatchlistScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Number(raw);
  const theme = useTheme();
  const client = useQueryClient();
  const detail = useWatchlist(id);
  const remove = useRemoveFromWatchlist(id);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [sort, setSort] = useState<Sort>('list');

  const rows = useMemo(() => sorted(detail.data?.rows ?? [], sort), [detail.data, sort]);

  const rename = useMutation({
    mutationFn: (name: string) => api.updateWatchlist(id, { name }),
    onSuccess: () => {
      setRenaming(false);
      void client.invalidateQueries({ queryKey: keys.watchlist(id) });
      void client.invalidateQueries({ queryKey: keys.watchlists });
    },
  });
  const makeDefault = useMutation({
    mutationFn: () => api.updateWatchlist(id, { isDefault: true }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.watchlists }),
  });
  const destroy = useMutation({
    mutationFn: () => api.deleteWatchlist(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.watchlists });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert(
      'Delete watchlist?',
      `“${detail.data?.watchlist.name ?? ''}” and its stocks will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => destroy.mutate() },
      ],
    );
  }

  const data = detail.data;
  return (
    <Screen refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()}>
      <Stack.Screen
        options={{
          title: data?.watchlist.name ?? 'Watchlist',
          headerRight: () =>
            data && data.rows.length > 0 ? (
              <Button
                title={editing ? 'Done' : 'Edit'}
                kind="ghost"
                fullWidth={false}
                onPress={() => setEditing((e) => !e)}
              />
            ) : null,
        }}
      />
      {detail.isPending ? (
        <SkeletonCard lines={6} />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <>
          <View style={styles.meta}>
            <MarketStatus
              phase={data?.market.phase ?? 'unknown'}
              stale={data?.quotesStale === true}
            />
            <Text variant="caption" color="muted">
              {data?.quotesStale
                ? 'Prices could not be refreshed'
                : `Prices at ${istTime(data?.fetchedAt)}`}
            </Text>
          </View>

          {data && data.rows.length > 1 ? (
            <View style={styles.chips}>
              {SORTS.map((s) => (
                <Button
                  key={s.id}
                  title={s.label}
                  kind={sort === s.id ? 'primary' : 'secondary'}
                  fullWidth={false}
                  onPress={() => setSort(s.id)}
                  accessibilityState={{ selected: sort === s.id }}
                />
              ))}
            </View>
          ) : null}

          <Button
            title="Add stocks"
            kind="secondary"
            onPress={() => router.push({ pathname: '/search', params: { addTo: String(id) } })}
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="add-circle-outline"
              title="This list is empty"
              message="Search for a stock and add it here."
            />
          ) : (
            <Card style={{ paddingVertical: 0 }}>
              {rows.map((row) => (
                <QuoteRow
                  key={row.instrumentId}
                  row={row}
                  stale={
                    data?.quotesStale === true || data?.missingQuotes.includes(row.symbol) === true
                  }
                  wide={theme.size !== 'compact'}
                  onPress={() => router.push(`/stock/${encodeURIComponent(row.symbol)}`)}
                  {...(editing ? { onRemove: () => remove.mutate([row.instrumentId]) } : {})}
                />
              ))}
            </Card>
          )}
          {data && data.missingQuotes.length > 0 && !data.quotesStale ? (
            <Text variant="caption" color="muted">
              No live price for: {data.missingQuotes.join(', ')}
            </Text>
          ) : null}
          {remove.isError ? <Text color="destructive">{errorMessage(remove.error)}</Text> : null}

          {editing ? (
            <View style={styles.manage}>
              <Button title="Rename" kind="secondary" onPress={() => setRenaming(true)} />
              {data && !data.watchlist.isDefault ? (
                <Button
                  title="Make default"
                  kind="secondary"
                  loading={makeDefault.isPending}
                  onPress={() => makeDefault.mutate()}
                />
              ) : null}
              <Button
                title="Delete watchlist"
                kind="destructive"
                loading={destroy.isPending}
                onPress={confirmDelete}
              />
            </View>
          ) : null}
        </>
      )}
      <Prompt
        visible={renaming}
        title="Rename watchlist"
        label="Name"
        initial={data?.watchlist.name ?? ''}
        confirm="Save"
        busy={rename.isPending}
        error={rename.isError ? errorMessage(rename.error) : null}
        onSubmit={(name) => rename.mutate(name)}
        onCancel={() => setRenaming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  manage: { gap: 12 },
});
