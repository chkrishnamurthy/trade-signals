'use client';

import type { ReactNode } from 'react';
import {
  IndicatorValue,
  Percent,
  PercentChange,
  Price,
  PriceChange,
  Ratio,
  Turnover,
  Volume,
} from '@/components/market/numeric';
import { SignalBadge, SignalStrength, VolumeIndicator } from '@/components/market/signal';
import { StockIdentity } from '@/components/market/stock-identity';
import { Badge } from '@/components/ui/badge';
import * as fmt from '@/lib/format';
import { RETURN_WINDOWS } from '@/lib/return-windows';
import { toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { getColumn } from '@/lib/watchlist-columns';
import type { WatchlistRowDto } from '@/lib/watchlist-types';

/**
 * How each watchlist column renders.
 *
 * The registry in `watchlist-columns.ts` holds everything about a column that
 * is data — its group, its source, how to read a sortable value. This holds the
 * one thing that is not: the pixels. Keeping them apart is what lets the whole
 * sorting/filtering/availability model be unit-tested without a DOM.
 *
 * Every number goes through the `market/numeric` components, so this file makes
 * no decisions about decimals, Indian grouping, tone colour or the em dash for
 * missing data. A cell that formatted its own number would be the start of the
 * table disagreeing with the rest of the product.
 */

/** Renders an unavailable column. Never a number — see the registry comment. */
function noSource(columnId: string): (row: WatchlistRowDto) => ReactNode {
  const reason = getColumn(columnId)?.unavailableReason ?? 'No data source for this field';
  return () => (
    <span className="text-subtle-foreground" title={reason}>
      <span aria-hidden>—</span>
      <span className="sr-only">Not available: {reason}</span>
    </span>
  );
}

/** Price against a reference line: toned by which side of it we are on. */
function AgainstLine({ paise, reference }: { paise: number | null; reference: number | null }) {
  if (paise === null) return <Price paise={null} bare size="sm" />;
  const tone = reference === null ? 'neutral' : toneOf(reference - paise);
  return <Price paise={paise} bare size="sm" className={toneText({ tone })} />;
}

/**
 * A low–high band with a marker showing where the price sits inside it.
 *
 * The two prices answer "what is the range?" and the track answers "where in
 * it are we?" — the second question is the one that is asked while scanning
 * fifty rows, and a percentage alone ("73.4%") cannot be scanned at all.
 */
function RangeBand({
  low,
  high,
  position,
  label,
}: {
  low: number | null;
  high: number | null;
  position: number | null;
  label: string;
}) {
  if (low === null || high === null) {
    return <Price paise={null} bare size="sm" />;
  }
  const clamped = position === null ? null : Math.max(0, Math.min(100, position));

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="figure whitespace-nowrap text-xs text-foreground">
        {fmt.priceCompact(low)}
        <span className="px-1 text-subtle-foreground">–</span>
        {fmt.priceCompact(high)}
      </span>
      <span
        className="relative h-1 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          clamped === null
            ? `${label}: no last price`
            : `${label}: ${clamped.toFixed(0)}% of the way from low to high`
        }
      >
        {clamped !== null && (
          <span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              clamped >= 50 ? 'bg-bullish' : 'bg-bearish',
            )}
            style={{ width: `${Math.max(2, clamped)}%` }}
          />
        )}
      </span>
    </span>
  );
}

/** A yes/no reading. "No" stays quiet so the eye finds the "yes" rows. */
function Flag({ on, label }: { on: number | string | null; label: string }) {
  if (on === null) return <span className="text-subtle-foreground">—</span>;
  return on === 1 ? (
    <Badge variant="warning" size="sm">
      {label}
    </Badge>
  ) : (
    <span className="text-xs text-subtle-foreground">No</span>
  );
}

/** A registry-derived percentage, rendered as a toned signed change. */
function derivedPercent(columnId: string): (row: WatchlistRowDto) => ReactNode {
  return (row) => {
    const value = getColumn(columnId)?.value(row);
    return <PercentChange value={typeof value === 'number' ? value : null} size="sm" />;
  };
}

const CELLS: Record<string, (row: WatchlistRowDto) => ReactNode> = {
  symbol: (row) => (
    <StockIdentity symbol={row.symbol} name={row.name} size="sm">
      <Badge variant="outline" size="sm" className="font-normal text-muted-foreground">
        {row.exchange}
      </Badge>
      {row.indicatorDate === null && (
        <Badge
          variant="outline"
          size="sm"
          title="No end-of-day indicators stored for this instrument yet"
        >
          quote only
        </Badge>
      )}
    </StockIdentity>
  ),

  // --- Price ----------------------------------------------------------------
  ltp: (row) => <Price paise={row.ltp} bare size="sm" weight="medium" />,
  change: (row) => <PriceChange paise={row.change} size="sm" />,
  changePercent: (row) => <PercentChange value={row.changePercent} size="sm" />,
  previousClose: (row) => <Price paise={row.previousClose} bare size="sm" />,
  open: (row) => <Price paise={row.open} bare size="sm" />,
  dayHigh: (row) => <Price paise={row.dayHigh} bare size="sm" />,
  dayLow: (row) => <Price paise={row.dayLow} bare size="sm" />,
  dayRange: (row) => {
    const position = getColumn('dayRange')?.value(row);
    return (
      <RangeBand
        low={row.dayLow}
        high={row.dayHigh}
        position={typeof position === 'number' ? position : null}
        label="Day range"
      />
    );
  },
  averagePrice: (row) => <Price paise={row.averagePrice} bare size="sm" />,
  upperCircuit: noSource('upperCircuit'),
  lowerCircuit: noSource('lowerCircuit'),

  // --- Volume & liquidity ---------------------------------------------------
  volume: (row) => <Volume shares={row.volume} size="sm" />,
  averageVolume: (row) => <Volume shares={row.averageVolume} size="sm" />,
  volumeChangePercent: derivedPercent('volumeChangePercent'),
  relativeVolume: (row) => <VolumeIndicator relativeVolume={row.relativeVolume} />,
  turnover: (row) => {
    const value = getColumn('turnover')?.value(row);
    return <Turnover paise={typeof value === 'number' ? value : null} size="sm" />;
  },
  deliveryPercent: noSource('deliveryPercent'),

  // --- Valuation and fundamentals (no source) -------------------------------
  marketCap: noSource('marketCap'),
  peRatio: noSource('peRatio'),
  forwardPeRatio: noSource('forwardPeRatio'),
  pbRatio: noSource('pbRatio'),
  pegRatio: noSource('pegRatio'),
  evEbitda: noSource('evEbitda'),
  dividendYield: noSource('dividendYield'),
  eps: noSource('eps'),
  epsGrowth: noSource('epsGrowth'),
  revenue: noSource('revenue'),
  revenueGrowth: noSource('revenueGrowth'),
  profitGrowth: noSource('profitGrowth'),
  roe: noSource('roe'),
  roce: noSource('roce'),
  debtToEquity: noSource('debtToEquity'),
  promoterHolding: noSource('promoterHolding'),
  promoterPledge: noSource('promoterPledge'),

  // --- 52-week position -----------------------------------------------------
  range52w: (row) => {
    const position = getColumn('range52w')?.value(row);
    return (
      <RangeBand
        low={row.low52w}
        high={row.high52w}
        position={typeof position === 'number' ? position : null}
        label="52-week range"
      />
    );
  },
  high52w: (row) => <Price paise={row.high52w} bare size="sm" />,
  low52w: (row) => <Price paise={row.low52w} bare size="sm" />,
  from52wHigh: derivedPercent('from52wHigh'),
  from52wLow: derivedPercent('from52wLow'),
  near52wHigh: (row) => <Flag on={getColumn('near52wHigh')?.value(row) ?? null} label="At high" />,
  near52wLow: (row) => <Flag on={getColumn('near52wLow')?.value(row) ?? null} label="At low" />,

  // --- Technical indicators -------------------------------------------------
  rsi14: (row) => {
    const value = row.rsi14;
    const condition =
      value === null ? undefined : value > 70 ? 'Overbought' : value < 30 ? 'Oversold' : undefined;
    const tone =
      condition === 'Overbought' ? 'bearish' : condition === 'Oversold' ? 'bullish' : 'neutral';
    return (
      <span title={condition}>
        <IndicatorValue value={value} className={toneText({ tone })} />
        {condition !== undefined && <span className="sr-only"> {condition}</span>}
      </span>
    );
  },
  macdHistogram: (row) => <PriceChange paise={row.macdHistogram} size="sm" />,
  sma20: (row) => <AgainstLine paise={row.sma20} reference={row.ltp} />,
  sma50: (row) => <AgainstLine paise={row.sma50} reference={row.ltp} />,
  sma100: noSource('sma100'),
  sma200: noSource('sma200'),
  ema20: (row) => <AgainstLine paise={row.ema20} reference={row.ltp} />,
  ema50: (row) => <AgainstLine paise={row.ema50} reference={row.ltp} />,
  ema200: (row) => <AgainstLine paise={row.ema200} reference={row.ltp} />,
  atr14: (row) => <Price paise={row.atr14} bare size="sm" />,
  atrPercent: (row) => {
    const value = getColumn('atrPercent')?.value(row);
    return <Percent value={typeof value === 'number' ? value : null} decimals={2} size="sm" />;
  },
  adx14: noSource('adx14'),
  stochastic: noSource('stochastic'),
  bollingerBands: noSource('bollingerBands'),

  // --- Trading signals ------------------------------------------------------
  /**
   * The daily engine's direction.
   *
   * Deliberately the descriptive vocabulary — "Bullish", not "BUY". The
   * direction badge on an intraday TRADE signal may read BUY or SELL; a daily
   * bias column may not, and never has.
   */
  signal: (row) =>
    row.signal === null ? (
      <span className="text-subtle-foreground" title="No stored daily signal for this instrument">
        —
      </span>
    ) : (
      <SignalBadge
        direction={row.signal.direction}
        title={`From the session of ${row.signal.tradingDate}`}
      />
    ),
  signalStrength: (row) =>
    row.signal === null ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <SignalStrength
        strength={row.signal.strength}
        direction={row.signal.direction}
        className="w-24"
      />
    ),
  signalSetups: (row) => {
    const setups = row.signal?.setups ?? [];
    if (setups.length === 0) return <span className="text-subtle-foreground">—</span>;
    // Two, then a count. A row that lists five setups is a row nobody reads.
    const shown = setups.slice(0, 2);
    return (
      <span className="flex flex-wrap items-center gap-1" title={setups.join(', ')}>
        {shown.map((setup) => (
          <Badge key={setup} variant="outline" size="sm" className="font-normal">
            {setup}
          </Badge>
        ))}
        {setups.length > shown.length && (
          <span className="text-[0.6875rem] text-muted-foreground">
            +{setups.length - shown.length}
          </span>
        )}
      </span>
    );
  },

  /** How many of the three EMAs price is above, as "2/3" plus a tone. */
  trend: (row) => {
    const value = getColumn('trend')?.value(row);
    if (typeof value !== 'number') return <IndicatorValue value={null} />;
    const variant = value === 3 ? 'bullish' : value === 0 ? 'bearish' : 'neutral';
    return (
      <Badge variant={variant} size="sm" title="EMAs (20, 50, 200) the price is trading above">
        {value}/3
      </Badge>
    );
  },
  momentum: noSource('momentum'),

  setupState: (row) => {
    const setup = row.setup;
    if (setup === null) return <span className="text-subtle-foreground">—</span>;
    return (
      <span className="flex items-center gap-1">
        <Badge variant={setup.direction === 'long' ? 'bullish' : 'bearish'} size="sm">
          {SETUP_KIND_LABEL[setup.kind] ?? setup.kind}
        </Badge>
        <span className="text-[0.6875rem] text-muted-foreground">{setup.state}</span>
      </span>
    );
  },
  /**
   * The meter treatment, not a bare number — a confluence score is exactly
   * the "confidence number the factors can't explain" CLAUDE.md bans if it
   * renders unexplained. `SignalStrength` was built to take this component's
   * long/short vocabulary via `tone`; the full factor breakdown lives one
   * click away through "View signals" in the row detail below.
   */
  setupScore: (row) =>
    row.setup === null ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <SignalStrength
        strength={row.setup.score}
        tone={row.setup.direction === 'long' ? 'bullish' : 'bearish'}
        label="Confluence score"
        className="w-24"
      />
    ),
  /** A price BAND, because the setup's entry is a zone and not a single price. */
  entryZone: (row) =>
    row.setup === null ? (
      <Price paise={null} bare size="sm" />
    ) : (
      <span className="figure whitespace-nowrap text-xs">
        {fmt.priceCompact(row.setup.entryLow)}
        <span className="px-1 text-subtle-foreground">–</span>
        {fmt.priceCompact(row.setup.entryHigh)}
      </span>
    ),
  setupTarget: (row) => <Price paise={row.setup?.target1 ?? null} bare size="sm" />,
  setupInvalidation: (row) => <Price paise={row.setup?.invalidationLevel ?? null} bare size="sm" />,
  setupRiskReward: (row) => (
    <Ratio value={row.setup?.netRiskReward ?? null} suffix=":1" size="sm" />
  ),
  support: noSource('support'),
  resistance: noSource('resistance'),

  // --- Market information ---------------------------------------------------
  sector: (row) =>
    row.sector === null ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <span className="truncate text-xs text-muted-foreground">{row.sector}</span>
    ),
  exchange: (row) => (
    <Badge variant="outline" size="sm">
      {row.exchange}
    </Badge>
  ),
  note: (row) =>
    row.note === null || row.note === '' ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <span className="line-clamp-1 max-w-40 text-xs text-muted-foreground" title={row.note}>
        {row.note}
      </span>
    ),
  indicatorDate: (row) => (
    <span className="figure text-[0.6875rem] text-muted-foreground">
      {row.indicatorDate ?? '—'}
    </span>
  ),
  quoteAt: (row) => (
    <span className="figure text-[0.6875rem] text-muted-foreground">
      {fmt.istTime(row.quoteAt)}
    </span>
  ),
};

/** Readable names for the intraday engine's setup kinds. */
const SETUP_KIND_LABEL: Record<string, string> = {
  breakout: 'Breakout',
  breakdown: 'Breakdown',
  vwap_reclaim: 'VWAP reclaim',
  momentum_long: 'Momentum',
  momentum_short: 'Momentum',
  reversal: 'Reversal',
  range_break: 'Range break',
};

// The trailing-return columns render identically, so they are registered from
// the same declaration the registry generates them from — a window added there
// cannot arrive here without a cell.
for (const window of RETURN_WINDOWS) {
  CELLS[window.id] = derivedPercent(window.id);
}

/**
 * The renderer for a column id.
 *
 * Falls back to an em dash rather than throwing: a column declared in the
 * registry with no cell here is a bug, but it is not one worth blanking the
 * whole watchlist over. `watchlist-model.test.ts` asserts the two lists match,
 * so the fallback should never be reached in practice.
 */
export function cellFor(columnId: string): (row: WatchlistRowDto) => ReactNode {
  return CELLS[columnId] ?? (() => <span className="text-subtle-foreground">—</span>);
}

export function hasCell(columnId: string): boolean {
  return columnId in CELLS;
}
