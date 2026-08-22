import type { MoverDto } from './dashboard-types';
import type { StockRowDto } from './stocks-types';

/**
 * Merging per-index quote snapshots into one universe.
 *
 * Pure, and in `lib` rather than `server`, so it can be tested without a
 * provider call. This is the part of the stocks feed that can actually be
 * wrong: six banks sit in both NIFTY 50 and BANK NIFTY, and getting the dedupe
 * or the membership wrong shows the same stock twice or hides it from the
 * index filter.
 */

export interface IndexQuotes {
  readonly key: string;
  readonly quotes: readonly MoverDto[];
}

export interface MergedStocks {
  readonly rows: StockRowDto[];
  /** Constituent count per index key, before deduplication. */
  readonly counts: Map<string, number>;
}

/**
 * One row per symbol, carrying every index it belongs to.
 *
 * First index wins on name and sector: a symbol in two indices is one
 * instrument with one sector, and `config/indices.yaml` agrees with itself on
 * those fields. What differs between them is membership, which accumulates.
 *
 * Insertion order is preserved so the list arrives in config order when the
 * table's sort is cleared.
 */
export function mergeStockRows(perIndex: readonly IndexQuotes[]): MergedStocks {
  const bySymbol = new Map<string, { row: MoverDto; indices: string[] }>();
  const counts = new Map<string, number>();

  for (const { key, quotes } of perIndex) {
    counts.set(key, quotes.length);
    for (const quote of quotes) {
      const existing = bySymbol.get(quote.symbol);
      if (existing === undefined) {
        bySymbol.set(quote.symbol, { row: quote, indices: [key] });
      } else if (!existing.indices.includes(key)) {
        existing.indices.push(key);
      }
    }
  }

  const rows: StockRowDto[] = [];
  for (const { row, indices } of bySymbol.values()) rows.push({ ...row, indices });
  return { rows, counts };
}

/**
 * Symbols the provider genuinely had no quote for.
 *
 * A symbol absent from one index's snapshot but present in another's is not
 * missing — reporting it would tell the operator a stock is unavailable while
 * its row sits in the table above the warning.
 */
export function mergeMissingSymbols(
  missingPerIndex: readonly (readonly string[])[],
  resolved: readonly StockRowDto[],
): string[] {
  const present = new Set(resolved.map((row) => row.symbol));
  return [...new Set(missingPerIndex.flat().filter((symbol) => !present.has(symbol)))].sort();
}
