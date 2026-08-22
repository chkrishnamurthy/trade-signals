import 'server-only';
import type { StockSignalDto } from '@/lib/dashboard-types';
import { mergeMissingSymbols, mergeStockRows } from '@/lib/stocks-merge';
import type { StockIndexDto, StocksDto, StockTechnicalsDto } from '@/lib/stocks-types';
import { computeSectors } from './analytics';
import { getDashboard } from './dashboard';
import { toMarketError } from './errors';
import { getIndex, listIndexKeys } from './indices';
import { getSignals } from './signals';

/**
 * The whole tracked universe as one list.
 *
 * The dashboard is per-index and renders slices — top eight gainers, top eight
 * losers. This is the other shape of the same data: every constituent of every
 * configured index, once, so it can be sorted and sliced by sector.
 *
 * Composed from the existing per-index snapshots rather than fetching its own
 * quotes. `getDashboard` and `getSignals` each hold a module-level cache with
 * request coalescing, so the dashboard being open makes this page free, and two
 * tabs on this page cost one fetch. Adding a `nifty100` block to
 * `config/indices.yaml` widens the page with no change here — that is the point
 * of iterating `listIndexKeys()` rather than naming the two indices we have.
 *
 * Cost of the second index today: BANK NIFTY's twelve constituents ride inside
 * the same 50-symbol quote batch, and its technicals add twelve daily-history
 * calls per fifteen-minute cache window.
 */

async function build(): Promise<StocksDto> {
  const keys = await listIndexKeys();
  const snapshots = await Promise.all(
    keys.map(async (key) => ({ key, snapshot: await getDashboard(key) })),
  );

  const { rows, counts } = mergeStockRows(
    snapshots.map(({ key, snapshot }) => ({ key, quotes: snapshot.quotes })),
  );

  const indices: StockIndexDto[] = [];
  for (const key of keys) {
    const resolved = await getIndex(key);
    if (resolved === null) continue;
    indices.push({ key, name: resolved.name, count: counts.get(key) ?? 0 });
  }

  const missing = mergeMissingSymbols(
    snapshots.map(({ snapshot }) => snapshot.missing),
    rows,
  );

  const first = snapshots[0]?.snapshot;
  return {
    rows,
    sectors: computeSectors(rows),
    indices,
    market: first?.market ?? { isOpen: false, phase: 'unknown' },
    fetchedAt: first?.fetchedAt ?? new Date().toISOString(),
    missing,
    // The shortest deadline wins: one index reporting a tighter interval means
    // the upstream asked for it, and polling the union slower than its fastest
    // member would render one index staler than the dashboard shows it.
    refreshAfterSeconds: Math.min(
      ...snapshots.map(({ snapshot }) => snapshot.refreshAfterSeconds),
      120,
    ),
  };
}

export async function getStocks(): Promise<StocksDto> {
  try {
    return await build();
  } catch (error: unknown) {
    throw toMarketError(error);
  }
}

/**
 * Daily indicators for the whole universe.
 *
 * Deliberately a separate entry point on a separate route: this is fifty-odd
 * history calls behind a fifteen-minute cache, and the table must render
 * without waiting for it. A symbol absent from the result renders an em dash,
 * never a zero.
 */
export async function getStockTechnicals(): Promise<StockTechnicalsDto> {
  try {
    const keys = await listIndexKeys();
    const reports = await Promise.all(keys.map((key) => getSignals(key)));

    const bySymbol = new Map<string, StockSignalDto>();
    const skipped = new Set<string>();
    for (const report of reports) {
      for (const signal of report.signals) bySymbol.set(signal.symbol, signal);
      for (const symbol of report.skipped) skipped.add(symbol);
    }
    // A symbol skipped for one index but evaluated for another is not skipped.
    for (const symbol of bySymbol.keys()) skipped.delete(symbol);

    return {
      signals: [...bySymbol.values()],
      computedAt: reports[0]?.computedAt ?? new Date().toISOString(),
      skipped: [...skipped].sort(),
    };
  } catch (error: unknown) {
    throw toMarketError(error);
  }
}
