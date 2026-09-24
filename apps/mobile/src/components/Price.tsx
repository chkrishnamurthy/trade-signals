import { StyleSheet, View } from 'react-native';
import { arrow, percent, signedPrice, tone } from '@/lib/format';
import { toneColor, useTheme } from '@/lib/theme';
import { Text } from './Text';

/**
 * A signed move: arrow + absolute change + percent. Direction is carried by the
 * arrow and the sign as well as colour, never colour alone.
 */
export function PriceChange({
  change,
  changePercent,
  size = 'body',
  showAbsolute = true,
  invertTone = false,
}: {
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly size?: 'caption' | 'label' | 'body' | 'bodyLarge';
  readonly showAbsolute?: boolean;
  /** For a volatility index: a rise is risk-off. Flips the colour, never the number. */
  readonly invertTone?: boolean;
}) {
  const theme = useTheme();
  const raw = tone(changePercent ?? change);
  const t = invertTone && raw !== 'neutral' ? (raw === 'positive' ? 'negative' : 'positive') : raw;
  const color = toneColor(theme, t);
  return (
    <View style={styles.row}>
      <Text variant={size} color={color} weight="medium" numeric>
        {arrow(changePercent ?? change)} {showAbsolute ? `${signedPrice(change)} ` : ''}
        {showAbsolute ? `(${percent(changePercent)})` : percent(changePercent)}
      </Text>
    </View>
  );
}

/** A soft, tinted pill for a percent move — used in dense lists. */
export function ChangePill({ value }: { readonly value: number | null }) {
  const theme = useTheme();
  const t = tone(value);
  const bg =
    t === 'positive'
      ? theme.colors['bullish-soft']
      : t === 'negative'
        ? theme.colors['bearish-soft']
        : theme.colors['neutral-soft'];
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderRadius: theme.radius.md }]}>
      <Text variant="label" weight="semibold" color={toneColor(theme, t)} numeric>
        {percent(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, minWidth: 76, alignItems: 'flex-end' },
});
