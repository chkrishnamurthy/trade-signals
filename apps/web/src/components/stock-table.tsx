'use client';

import { useMemo, useState } from 'react';
import { priceCompact, signedPercent, signedPrice, toneFor, volume } from '@/lib/format';
import type { QuoteDto } from '@/lib/market-types';

export type SortKey =
  | 'symbol'
  | 'ltp'
  | 'change'
  | 'changePercent'
  | 'open'
  | 'high'
  | 'low'
  | 'volume';
type Direction = 'asc' | 'desc';

interface Column {
  readonly key: SortKey;
  readonly label: string;
  readonly numeric: boolean;
  /** Hidden below sm to keep the table readable on a phone. */
  readonly hideOnMobile?: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'symbol', label: 'Stock', numeric: false },
  { key: 'ltp', label: 'LTP', numeric: true },
  { key: 'change', label: 'Change', numeric: true },
  { key: 'changePercent', label: 'Change %', numeric: true },
  { key: 'open', label: 'Open', numeric: true, hideOnMobile: true },
  { key: 'high', label: 'High', numeric: true, hideOnMobile: true },
  { key: 'low', label: 'Low', numeric: true, hideOnMobile: true },
  { key: 'volume', label: 'Volume', numeric: true, hideOnMobile: true },
];

function valueFor(quote: QuoteDto, key: SortKey): number | string | null {
  if (key === 'symbol') return quote.symbol;
  return quote[key];
}

/** Nulls always sort last, whichever direction is active. */
function compare(a: QuoteDto, b: QuoteDto, key: SortKey, direction: Direction): number {
  const left = valueFor(a, key);
  const right = valueFor(b, key);

  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const result =
    typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right)
      : Number(left) - Number(right);

  return direction === 'asc' ? result : -result;
}

interface Props {
  readonly quotes: readonly QuoteDto[];
  readonly onSelect: (quote: QuoteDto) => void;
}

export function StockTable({ quotes, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [direction, setDirection] = useState<Direction>('desc');

  const sorted = useMemo(
    () => [...quotes].sort((a, b) => compare(a, b, sortKey, direction)),
    [quotes, sortKey, direction],
  );

  const toggle = (key: SortKey): void => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Names read best A-Z; numbers read best largest-first.
    setDirection(key === 'symbol' ? 'asc' : 'desc');
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
          <tr>
            {COLUMNS.map((column) => {
              const active = column.key === sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`border-b border-slate-200 dark:border-slate-800 ${
                    column.hideOnMobile === true ? 'hidden sm:table-cell' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={`flex w-full items-center gap-1 px-3 py-2.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${
                      column.numeric ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {column.label}
                    <span
                      className={`text-[10px] ${active ? 'opacity-100' : 'opacity-0'}`}
                      aria-hidden
                    >
                      {direction === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((quote) => {
            const tone = toneFor(quote.change);
            return (
              <tr
                key={quote.symbol}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 focus-within:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50 dark:focus-within:bg-slate-800/50"
              >
                <td className="px-3 py-2.5">
                  {/* The button carries the semantics; the row highlights via
                      focus-within so mouse and keyboard behave identically. */}
                  <button
                    type="button"
                    onClick={() => onSelect(quote)}
                    aria-label={`Details for ${quote.name}`}
                    className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <span className="block font-medium">{quote.symbol}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {quote.name}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {priceCompact(quote.ltp)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${tone}`}>
                  {signedPrice(quote.change)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${tone}`}>
                  {signedPercent(quote.changePercent)}
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                  {priceCompact(quote.open)}
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                  {priceCompact(quote.high)}
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                  {priceCompact(quote.low)}
                </td>
                <td className="hidden px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 sm:table-cell dark:text-slate-400">
                  {volume(quote.volume)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
