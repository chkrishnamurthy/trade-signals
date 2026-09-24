import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Grid } from '@/components/Grid';
import { Prompt } from '@/components/Prompt';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { api, errorMessage } from '@/lib/api';
import { istDate } from '@/lib/format';
import { keys, useWatchlists } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/** Every watchlist, plus one-tap starter lists (indices and sectors). */
export default function WatchlistsScreen() {
  const theme = useTheme();
  const client = useQueryClient();
  const lists = useWatchlists();
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const create = useMutation({
    mutationFn: (name: string) => api.createWatchlist(name),
    onSuccess: (list) => {
      setCreating(false);
      void client.invalidateQueries({ queryKey: keys.watchlists });
      router.push(`/watchlist/${list.id}`);
    },
  });

  return (
    <Screen refreshing={lists.isRefetching} onRefresh={() => void lists.refetch()}>
      <View style={styles.actions}>
        <Button
          title="New watchlist"
          fullWidth={false}
          icon={<Ionicons name="add" size={18} color={theme.colors['primary-foreground']} />}
          onPress={() => setCreating(true)}
        />
        <Button
          title={showTemplates ? 'Hide starter lists' : 'Starter lists'}
          kind="secondary"
          fullWidth={false}
          onPress={() => setShowTemplates((v) => !v)}
        />
      </View>

      {showTemplates ? <Templates /> : null}

      {lists.isPending ? (
        <Grid>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </Grid>
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
      ) : lists.data.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="No watchlists yet"
          message="Create one, or start from a ready-made list such as NIFTY 50."
          action={{ label: 'Browse starter lists', onPress: () => setShowTemplates(true) }}
        />
      ) : (
        <Grid>
          {lists.data.map((list) => (
            <Card
              key={list.id}
              accessibilityLabel={`${list.name}, ${list.count} stocks`}
              onPress={() => router.push(`/watchlist/${list.id}`)}
            >
              <View style={styles.cardHead}>
                <Text variant="bodyLarge" weight="semibold" numberOfLines={1} style={styles.flex}>
                  {list.name}
                </Text>
                {list.isDefault ? (
                  <View style={[styles.badge, { backgroundColor: theme.colors['bullish-soft'] }]}>
                    <Text
                      variant="caption"
                      weight="semibold"
                      color={theme.colors['bullish-strong']}
                    >
                      Default
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text color="muted" variant="label">
                {list.count} {list.count === 1 ? 'stock' : 'stocks'} · updated{' '}
                {istDate(list.updatedAt)}
              </Text>
            </Card>
          ))}
        </Grid>
      )}

      <Prompt
        visible={creating}
        title="New watchlist"
        label="Name"
        confirm="Create"
        busy={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
        onSubmit={(name) => create.mutate(name)}
        onCancel={() => {
          setCreating(false);
          create.reset();
        }}
      />
    </Screen>
  );
}

function Templates() {
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: keys.templates,
    queryFn: () => api.templates(),
    staleTime: 3_600_000,
  });
  const fromTemplate = useMutation({
    mutationFn: (id: string) => api.createFromTemplate(id),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.watchlists });
      router.push(`/watchlist/${result.watchlist.id}`);
    },
  });
  return (
    <Section title="Starter lists">
      {templates.isPending ? (
        <SkeletonCard />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : (
        <Grid>
          {templates.data.map((t) => (
            <Card
              key={t.id}
              onPress={() => fromTemplate.mutate(t.id)}
              accessibilityLabel={`Create ${t.name}`}
            >
              <Text weight="semibold">{t.name}</Text>
              <Text variant="caption" color="muted" numberOfLines={2}>
                {t.description} · {t.symbols.length} stocks
              </Text>
            </Card>
          ))}
        </Grid>
      )}
      {fromTemplate.isError ? (
        <Text color="destructive">{errorMessage(fromTemplate.error)}</Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  flex: { flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
});
