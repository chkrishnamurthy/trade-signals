import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider, ListRow } from '@/components/ListRow';
import { Prompt } from '@/components/Prompt';
import { Screen } from '@/components/Screen';
import { ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { keys, useAddToWatchlist, useWatchlists } from '@/lib/queries';

/** Pick which watchlist a stock goes into (or make a new one for it). */
export default function AddToWatchlistScreen() {
  const { symbol = '' } = useLocalSearchParams<{ symbol: string }>();
  const client = useQueryClient();
  const lists = useWatchlists();
  const add = useAddToWatchlist();
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const createAndAdd = useMutation({
    mutationFn: async (name: string) => {
      const list = await api.createWatchlist(name);
      await api.addSymbols(list.id, [symbol]);
      return list;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.watchlists });
      router.back();
    },
  });

  function addTo(id: number, name: string) {
    add.mutate(
      { id, symbols: [symbol] },
      {
        onSuccess: (result) => {
          if (result.duplicates.length > 0) setMessage(`${symbol} is already in ${name}.`);
          else router.back();
        },
      },
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `Add ${symbol}` }} />
      {lists.isPending ? (
        <SkeletonCard />
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {lists.data.map((list, i) => (
            <View key={list.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon="list-outline"
                title={list.name}
                detail={`${list.count} stocks`}
                onPress={() => addTo(list.id, list.name)}
              />
            </View>
          ))}
        </Card>
      )}
      {message ? <Text color="muted">{message}</Text> : null}
      {add.isError ? <Text color="destructive">{errorMessage(add.error)}</Text> : null}
      <Button
        title="New watchlist with this stock"
        kind="secondary"
        onPress={() => setCreating(true)}
      />
      <Prompt
        visible={creating}
        title="New watchlist"
        label="Name"
        confirm="Create & add"
        busy={createAndAdd.isPending}
        error={createAndAdd.isError ? errorMessage(createAndAdd.error) : null}
        onSubmit={(name) => createAndAdd.mutate(name)}
        onCancel={() => setCreating(false)}
      />
    </Screen>
  );
}
