/**
 * Header names we recognise in a broker's file, lower-cased with punctuation removed.
 * These are the broker's words, not ours: they are matched, never shown.
 */
export const SYMBOL = [
  'instrument',
  'symbol',
  'scrip',
  'scrip name',
  'stock',
  'stock name',
  'security',
  'company',
  'trading symbol',
];
export const SHARES = ['qty', 'quantity', 'shares', 'no of shares', 'holding qty', 'qty available'];
export const AVG = [
  'avg cost',
  'average cost',
  'avg price',
  'average price',
  'buy avg',
  'buy average',
  'avg buy price',
];
export const INVESTED = ['invested', 'invested value', 'total cost', 'buy value', 'cost'];
export const ISIN = ['isin'];
export const DATE = ['trade date', 'date', 'order execution time', 'execution date'];
export const SIDE = ['trade type', 'side', 'type', 'buy sell', 'transaction type'];
export const PRICE = ['price', 'trade price', 'rate'];
export const TRADE_ID = ['trade id', 'trade no', 'trade number'];
export const SEGMENT = ['segment'];
export const EXCHANGE = ['exchange'];
