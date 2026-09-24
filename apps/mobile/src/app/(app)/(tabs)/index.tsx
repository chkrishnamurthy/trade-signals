import type { IndexSnapshot } from '@equitywise/api-contracts';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { Grid } from '@/components/Grid';
import { MarketStatus } from '@/components/MarketStatus';
import { PriceChange } from '@/components/Price';
import { QuoteRow } from '@/components/QuoteRow';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { useAuth } from '@/lib/auth';
import { istTime, level, tone } from '@/lib/format';
import { useIndices, useWatchlist, useWatchlists } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/** Markets: "What is happening in the market?" — indices, session state, your top list. */
export default function MarketsScreen() {
  const { user } = useAuth();
  const indices = useIndices();
  const lists = useWatchlists();
  const defaultList = lists.data?.find((l) => l.isDefault) ?? lists.data?.[0];

  const refreshing = indices.isRefetching || lists.isRefetching;
  const greeting = user?.profile.displayName
    ? `Hello, ${user.profile.displayName.split(' ')[0]}`
    : 'Markets';

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void indices.refetch();
        void lists.refetch();
      }}
    >
      <Stack.Screen options={{ title: greeting }} />
      <View style={styles.status}>
        {indices.data ? (
          <MarketStatus
            phase={indices.data.market.phase}
            stale={indices.data.stale !== undefined}
          />
        ) : null}
        {indices.data ? (
          <Text variant="caption" color="muted">
            Updated {istTime(indices.data.asOf)}
          </Text>
        ) : null}
      </View>

      <Section title="Indices">
        {indices.isPending ? (
          <Grid>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </Grid>
        ) : indices.isError ? (
          <ErrorState error={indices.error} onRetry={() => void indices.refetch()} />
        ) : (
          <Grid>
            {indices.data.indices.map((index) => (
              <IndexCard key={index.symbol} index={index} />
            ))}
          </Grid>
        )}
      </Section>

      {defaultList ? (
        <DefaultWatchlist id={defaultList.id} name={defaultList.name} />
      ) : lists.isSuccess ? (
        <EmptyState
          icon="list-outline"
          title="No watchlists yet"
          message="Create a watchlist to follow the stocks you care about."
          action={{ label: 'Go to Watchlists', onPress: () => router.push('/watchlists') }}
        />
      ) : null}

      <Disclaimer />
    </Screen>
  );
}

function IndexCard({ index }: { readonly index: IndexSnapshot }) {
  const theme = useTheme();
  // A VIX rise is risk-off: invert the tone, never the number.
  const t = tone(index.changePercent);
  const inverted = index.display === 'volatility' && t !== 'neutral';
  return (
    <Card accessibilityLabel={`${index.name} ${level(index.ltp)}`}>
      <Text variant="label" color="muted" weight="medium">
        {index.name}
      </Text>
      <Text variant="title" weight="semibold" numeric style={{ marginTop: 4 }}>
        {level(index.ltp)}
      </Text>
      <PriceChange
        change={index.change}
        changePercent={index.changePercent}
        size="label"
        showAbsolute={false}
        invertTone={index.display === 'volatility'}
      />
      {inverted ? (
        <Text variant="caption" color={theme.colors['subtle-foreground']}>
          Volatility index — a rise signals more fear.
        </Text>
      ) : null}
    </Card>
  );
}

function DefaultWatchlist({ id, name }: { readonly id: number; readonly name: string }) {
  const detail = useWatchlist(id);
  const theme = useTheme();
  const rows = detail.data?.rows ?? [];
  const movers = [...rows]
    .filter((r) => r.changePercent !== null)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, 5);
  return (
    <Section
      title={name}
      action={
        <Button
          title="Open"
          kind="ghost"
          fullWidth={false}
          onPress={() => router.push(`/watchlist/${id}`)}
        />
      }
    >
      {detail.isPending ? (
        <SkeletonCard />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : movers.length === 0 ? (
        <EmptyState
          title="Nothing moving yet"
          message="Add stocks to this list to see their moves here."
        />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          <Text variant="caption" color="muted" style={{ paddingTop: 8 }}>
            Biggest moves today
          </Text>
          {movers.map((row) => (
            <QuoteRow
              key={row.instrumentId}
              row={row}
              stale={detail.data.quotesStale}
              wide={theme.size !== 'compact'}
              onPress={() => router.push(`/stock/${encodeURIComponent(row.symbol)}`)}
            />
          ))}
        </Card>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
});
