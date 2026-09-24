import { HISTORY_TIMEFRAMES, type StockDetail } from '@equitywise/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { PriceChart } from '@/components/PriceChart';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { ErrorState, Skeleton, SkeletonCard } from '@/components/States';
import { Text } from '@/components/Text';
import { istDate, price, ratio, volume } from '@/lib/format';
import { useHistory, useStock } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

/**
 * "Why does this stock deserve attention?" — chart, day and 52-week range, and
 * the end-of-day technical snapshot. Every value is a stored figure from the
 * server; the app recomputes nothing. No order affordance of any kind.
 */
export default function StockScreen() {
  const { symbol: raw = '' } = useLocalSearchParams<{ symbol: string }>();
  const symbol = decodeURIComponent(raw).toUpperCase();
  const theme = useTheme();
  const [timeframe, setTimeframe] = useState<string>('1D');
  const stock = useStock(symbol);
  const history = useHistory(symbol, timeframe);
  const wide = theme.size !== 'compact';

  return (
    <Screen
      refreshing={stock.isRefetching || history.isRefetching}
      onRefresh={() => {
        void stock.refetch();
        void history.refetch();
      }}
    >
      <Stack.Screen
        options={{
          title: symbol,
          headerRight: () => (
            <Button
              title="Watch"
              kind="ghost"
              fullWidth={false}
              icon={<Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />}
              onPress={() => router.push({ pathname: '/add-to-watchlist', params: { symbol } })}
            />
          ),
        }}
      />
      <View>
        {stock.data ? (
          <>
            <Text variant="title" weight="semibold">
              {stock.data.name}
            </Text>
            <Text variant="caption" color="muted">
              {stock.data.exchange} · {stock.data.sector}
              {stock.data.isin ? ` · ${stock.data.isin}` : ''}
            </Text>
          </>
        ) : stock.isPending ? (
          <Skeleton width="70%" height={22} />
        ) : null}
      </View>

      <View style={wide ? styles.columns : styles.stack}>
        <View style={wide ? styles.main : undefined}>
          <Card>
            {history.isPending ? (
              <Skeleton height={260} />
            ) : history.isError ? (
              <ErrorState
                error={history.error}
                onRetry={() => void history.refetch()}
                title="Chart unavailable"
              />
            ) : (
              <PriceChart
                bars={history.data.bars}
                intraday={timeframe === '1D' || timeframe === '5D'}
                height={wide ? 280 : 220}
              />
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tfs}
            >
              {HISTORY_TIMEFRAMES.map((tf) => (
                <Button
                  key={tf}
                  title={tf}
                  kind={tf === timeframe ? 'primary' : 'ghost'}
                  fullWidth={false}
                  accessibilityLabel={`Show ${tf} chart`}
                  accessibilityState={{ selected: tf === timeframe }}
                  onPress={() => setTimeframe(tf)}
                  style={styles.tf}
                />
              ))}
            </ScrollView>
          </Card>
        </View>

        <View style={wide ? styles.side : styles.stack}>
          {stock.isPending ? (
            <SkeletonCard lines={5} />
          ) : stock.isError ? (
            <ErrorState error={stock.error} onRetry={() => void stock.refetch()} />
          ) : (
            <Facts stock={stock.data} />
          )}
        </View>
      </View>

      {stock.data ? <Technicals stock={stock.data} /> : null}
      {stock.data && stock.data.corporateActions.length > 0 ? (
        <Section title="Corporate actions">
          <Card>
            {stock.data.corporateActions.map((a) => (
              <View key={`${a.kind}-${a.exDate}`} style={styles.kv}>
                <Text weight="medium" style={styles.flex}>
                  {a.kind} {a.ratio}
                </Text>
                <Text color="muted" variant="label">
                  ex {istDate(a.exDate)}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
      {stock.data && stock.data.peers.length > 0 ? (
        <Section title={`Other ${stock.data.sector} stocks`}>
          <View style={styles.peers}>
            {stock.data.peers.map((p) => (
              <Button
                key={p.symbol}
                title={p.symbol}
                kind="secondary"
                fullWidth={false}
                accessibilityLabel={`${p.symbol}, ${p.name}`}
                onPress={() => router.push(`/stock/${encodeURIComponent(p.symbol)}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}
      <Disclaimer />
    </Screen>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.kv}>
      <Text color="muted" variant="label" style={styles.flex}>
        {label}
      </Text>
      <Text weight="medium" numeric>
        {value}
      </Text>
    </View>
  );
}

function Facts({ stock }: { readonly stock: StockDetail }) {
  return (
    <Card>
      <Text variant="label" weight="semibold" color="muted">
        {stock.tradingDate ? `Session of ${istDate(stock.tradingDate)}` : 'Latest session'}
      </Text>
      <Fact label="Close" value={price(stock.close)} />
      <Fact label="Day range" value={`${price(stock.low)} – ${price(stock.high)}`} />
      <Fact label="52-week range" value={`${price(stock.low52w)} – ${price(stock.high52w)}`} />
      <Fact label="Volume" value={volume(stock.volume)} />
      <Fact label="Avg volume" value={volume(stock.averageVolume)} />
      <Fact
        label="Relative volume"
        value={stock.relativeVolume === null ? '—' : `${ratio(stock.relativeVolume)}×`}
      />
    </Card>
  );
}

/** Technical snapshot — stored end-of-day indicators, labelled as technical levels. */
function Technicals({ stock }: { readonly stock: StockDetail }) {
  const above = (level: number | null) =>
    level === null ? '' : stock.close >= level ? '  · price above' : '  · price below';
  return (
    <Section title="Technical snapshot">
      <Card>
        <Fact label="RSI (14)" value={ratio(stock.rsi14, 1)} />
        <Fact label="MACD histogram" value={ratio(stock.macdHistogram, 2)} />
        <Fact label="ATR (14)" value={price(stock.atr14)} />
        <Fact label="EMA 20" value={`${price(stock.ema20)}${above(stock.ema20)}`} />
        <Fact label="EMA 50" value={`${price(stock.ema50)}${above(stock.ema50)}`} />
        <Fact label="EMA 200" value={`${price(stock.ema200)}${above(stock.ema200)}`} />
        <Fact label="SMA 20" value={price(stock.sma20)} />
        <Fact label="SMA 50" value={price(stock.sma50)} />
        <Text variant="caption" color="subtle">
          Indicators are computed on closed daily candles after the session ends.
        </Text>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  stack: { gap: 16 },
  main: { flex: 3 },
  side: { flex: 2 },
  tfs: { gap: 4, paddingTop: 12 },
  tf: { paddingHorizontal: 12 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  flex: { flex: 1 },
  peers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
