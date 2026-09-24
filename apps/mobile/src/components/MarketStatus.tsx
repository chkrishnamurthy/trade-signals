import { StyleSheet, View } from 'react-native';
import { marketPhaseLabel } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { Text } from './Text';

/** Session state. `unknown` is deliberately not grey: unknown must never look closed. */
export function MarketStatus({
  phase,
  stale = false,
}: {
  readonly phase: string;
  readonly stale?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const dot =
    phase === 'open'
      ? c.bullish
      : phase === 'pre_open' || phase === 'closing_auction'
        ? c.warning
        : phase === 'closed' || phase === 'post_close'
          ? c.neutral
          : c['market-unknown'];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${marketPhaseLabel(phase)}${stale ? ', prices may be delayed' : ''}`}
      style={[
        styles.pill,
        { borderColor: c.border, backgroundColor: c.surface, borderRadius: theme.radius.pill },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text variant="caption" weight="medium" color="muted">
        {marketPhaseLabel(phase)}
        {stale ? ' · delayed' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
