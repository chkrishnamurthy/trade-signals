import type { HistoryBar } from '@equitywise/api-contracts';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { barTime, chartGeometry, nearestIndex } from '@/lib/chart-geometry';
import { istDateTime, percentChange, price, tone } from '@/lib/format';
import { toneColor, useTheme } from '@/lib/theme';
import { Text } from './Text';

/**
 * Close-price line chart. Drag a finger across it to read any bar's close and
 * time; the headline shows the change from the first bar in view. Coloured by
 * direction, with the numbers always spelled out.
 */
export function PriceChart({
  bars,
  height = 220,
  intraday = false,
}: {
  readonly bars: readonly HistoryBar[];
  readonly height?: number;
  readonly intraday?: boolean;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => bars.map((b) => ({ t: barTime(b.t), c: b.c })), [bars]);
  const geometry = useMemo(() => chartGeometry(points, width, height), [points, width, height]);

  const first = points[0];
  const shown = active !== null ? points[active] : points[points.length - 1];
  const move = first && shown ? percentChange(first.c, shown.c) : null;
  const color = toneColor(theme, tone(move));
  const lineColor =
    tone(move) === 'negative'
      ? theme.colors.bearish
      : tone(move) === 'positive'
        ? theme.colors.bullish
        : theme.colors.neutral;

  const onTouch = (x: number) => setActive(nearestIndex(x, width, points.length));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="headline" weight="semibold" numeric>
          {shown ? price(shown.c) : '—'}
        </Text>
        <Text variant="label" color={color} weight="medium" numeric>
          {move === null ? '' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}% in view`}
        </Text>
        <Text variant="caption" color="muted">
          {shown ? istDateTime(shown.t) : ''}
          {intraday ? '' : ''}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          first && shown
            ? `Price chart from ${price(first.c)} to ${price(shown.c)}, ${move?.toFixed(2) ?? 0} percent`
            : 'Price chart'
        }
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
      >
        {geometry ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.22} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={geometry.area} fill="url(#fill)" />
            <Path d={geometry.path} stroke={lineColor} strokeWidth={2} fill="none" />
            {active !== null ? (
              <Line
                x1={geometry.xs[active] ?? 0}
                x2={geometry.xs[active] ?? 0}
                y1={0}
                y2={height}
                stroke={theme.colors['chart-axis']}
                strokeDasharray="4 4"
              />
            ) : null}
          </Svg>
        ) : (
          <View style={[styles.empty, { borderColor: theme.colors.border }]}>
            <Text color="muted">Not enough data to draw a chart.</Text>
          </View>
        )}
      </View>
      {geometry ? (
        <View style={styles.range}>
          <Text variant="caption" color="muted" numeric>
            Low {price(geometry.min)}
          </Text>
          <Text variant="caption" color="muted" numeric>
            High {price(geometry.max)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: { gap: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  range: { flexDirection: 'row', justifyContent: 'space-between' },
});
