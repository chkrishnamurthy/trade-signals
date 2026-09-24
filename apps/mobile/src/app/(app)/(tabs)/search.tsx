import { MIN_TOUCH } from '@equitywise/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { errorMessage } from '@/lib/api';
import { useAddToWatchlist, useSymbolSearch, useWatchlists } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * Find a stock by symbol or company name. Opened with `?addTo=<watchlistId>`
 * it becomes "add to this watchlist": each result gets a one-tap add.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const { addTo } = useLocalSearchParams<{ addTo?: string }>();
  const targetId = addTo ? Number(addTo) : null;
  const lists = useWatchlists();
  const target = targetId === null ? null : lists.data?.find((l) => l.id === targetId);
  const [query, setQuery] = useState('');
  const results = useSymbolSearch(query);
  const add = useAddToWatchlist();
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: target ? `Add to ${target.name}` : 'Search' }} />
      <TextField
        label="Symbol or company"
        placeholder="e.g. RELIANCE or Tata Motors"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={targetId !== null}
        returnKeyType="search"
      />
      {query.trim() === '' ? (
        <EmptyState
          icon="search-outline"
          title="Search NSE stocks"
          message="Type a ticker or part of a company name."
        />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      ) : results.isPending ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : results.data.length === 0 ? (
        <EmptyState title="No matches" message={`Nothing found for “${query.trim()}”.`} />
      ) : (
        <Card style={{ paddingVertical: 0 }}>
          {results.data.map((hit) => {
            const isAdded = added.has(hit.symbol);
            return (
              <View
                key={`${hit.exchange}:${hit.symbol}`}
                style={[styles.row, { borderBottomColor: theme.colors.border }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${hit.symbol}, ${hit.name}`}
                  style={styles.hit}
                  onPress={() => router.push(`/stock/${encodeURIComponent(hit.symbol)}`)}
                >
                  <Text weight="semibold">{hit.symbol}</Text>
                  <Text variant="caption" color="muted" numberOfLines={1}>
                    {hit.name} · {hit.exchange}
                  </Text>
                </Pressable>
                {targetId !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isAdded ? `${hit.symbol} added` : `Add ${hit.symbol}`}
                    disabled={isAdded || add.isPending}
                    onPress={() =>
                      add.mutate(
                        { id: targetId, symbols: [hit.symbol] },
                        { onSuccess: () => setAdded((s) => new Set(s).add(hit.symbol)) },
                      )
                    }
                    style={styles.add}
                  >
                    <Ionicons
                      name={isAdded ? 'checkmark-circle' : 'add-circle-outline'}
                      size={28}
                      color={isAdded ? theme.colors.bullish : theme.colors.primary}
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${hit.symbol} to a watchlist`}
                    onPress={() =>
                      router.push({ pathname: '/add-to-watchlist', params: { symbol: hit.symbol } })
                    }
                    style={styles.add}
                  >
                    <Ionicons name="bookmark-outline" size={24} color={theme.colors.primary} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </Card>
      )}
      {add.isError ? <Text color="destructive">{errorMessage(add.error)}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { flex: 1, minHeight: MIN_TOUCH + 12, justifyContent: 'center', paddingVertical: 8 },
  add: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
