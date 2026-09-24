import { Text } from './Text';

/** The standing footnote: this is information, not advice, and not a broker. */
export function Disclaimer() {
  return (
    <Text variant="caption" color="subtle" style={{ textAlign: 'center' }}>
      EquityWise shows market data and technical observations for information only. It is not
      investment advice and cannot place orders. Prices may be delayed.
    </Text>
  );
}
