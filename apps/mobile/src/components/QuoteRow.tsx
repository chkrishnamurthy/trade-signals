import type { WatchlistRow } from '@equitywise/api-contracts';
import { MIN_TOUCH } from '@equitywise/design-tokens';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { percent, price } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { ChangePill } from './Price';
import { Text } from './Text';

/** One watchlist name: symbol & name, last price, day move. Tappable to the stock screen. */
export function QuoteRow({
  row,
  stale,
  onPress,
  onRemove,
  wide = false,
}: {
  readonly row: WatchlistRow;
  readonly stale: boolean;
  readonly onPress: () => void;
  readonly onRemove?: () => void;
  readonly wide?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.symbol}, ${row.name}, ${price(row.ltp)}, ${percent(row.changePercent)} today${stale ? ', price delayed' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
    >
      <View style={styles.name}>
        <Text weight="semibold" numberOfLines={1}>
          {row.symbol}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {row.name}
        </Text>
      </View>
      {wide ? (
        <View style={styles.extra}>
          <Text variant="caption" color="muted" numeric>
            RSI {row.rsi14 === null ? '—' : row.rsi14.toFixed(1)}
          </Text>
          <Text variant="caption" color="muted" numeric>
            52W H {price(row.high52w)}
          </Text>
        </View>
      ) : null}
      <View style={styles.price}>
        <Text
          weight="medium"
          numeric
          color={stale ? theme.colors['muted-foreground'] : 'foreground'}
        >
          {price(row.ltp)}
        </Text>
        <ChangePill value={row.changePercent} />
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${row.symbol}`}
          onPress={onRemove}
          hitSlop={8}
          style={styles.remove}
        >
          <Ionicons name="remove-circle" size={24} color={theme.colors.destructive} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH + 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, minWidth: 0 },
  extra: { width: 160, gap: 2 },
  price: { alignItems: 'flex-end', gap: 4 },
  remove: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
