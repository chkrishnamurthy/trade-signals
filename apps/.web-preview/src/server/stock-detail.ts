import 'server-only';
import {
  type CorporateActionRow,
  getInstrumentBySymbol,
  type InstrumentIndicators,
  latestIndicatorsForInstruments,
  listCorporateActions,
} from '@equitywise/db';
import { getDatabase, isDatabaseConfigured } from './db';
import { getIndex, listIndexKeys } from './indices';
import { resolveSymbol } from './search';

export interface PeerStock {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
}

export interface StockDetailPageData {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
  readonly exchange: string;
  readonly isin: string | null;
  readonly sector: string;
  readonly tradingDate: string | null;
  readonly close: number;
  readonly changePercent: number | null;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly high52w: number | null;
  readonly low52w: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly rsi14: number | null;
  readonly macdHistogram: number | null;
  readonly atr14: number | null;
  readonly averageVolume: number | null;
  readonly relativeVolume: number | null;
  readonly corporateActions: readonly CorporateActionRow[];
  readonly peers: readonly PeerStock[];
}

/**
 * Loads comprehensive stock analysis and technical metrics for a public stock page.
 */
export async function getStockDetail(rawSymbol: string): Promise<StockDetailPageData | null> {
  const normalized = rawSymbol.trim().toUpperCase();
  const resolved = await resolveSymbol(normalized);
  if (!resolved) return null;

  let isin: string | null = null;
  let indicators: InstrumentIndicators | null = null;
  let actions: readonly CorporateActionRow[] = [];

  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const inst = await getInstrumentBySymbol(db, resolved.symbol);

      if (inst !== null) {
        isin = inst.isin;
        const [indicatorMap, caRows] = await Promise.all([
          latestIndicatorsForInstruments(db, [inst.id]),
          listCorporateActions(db, inst.id, 10),
        ]);

        indicators = indicatorMap.get(inst.id) ?? null;
        actions = caRows;
      }
    } catch {
      // Degrades gracefully if DB is cold
    }
  }

  // Find sector peers from config/indices.yaml
  const peers: PeerStock[] = [];
  try {
    for (const key of await listIndexKeys()) {
      const idx = await getIndex(key);
      if (!idx) continue;
      for (const c of idx.constituents) {
        if (
          c.sector === resolved.sector &&
          c.symbol.toUpperCase() !== resolved.symbol.toUpperCase() &&
          !peers.some((p) => p.symbol === c.symbol)
        ) {
          peers.push({ symbol: c.symbol, name: c.name, sector: c.sector });
        }
      }
    }
  } catch {
    // Leave peers empty
  }

  const close = indicators?.close ?? 0;

  return {
    symbol: resolved.symbol,
    name: resolved.name,
    kind: resolved.kind === 'index' ? 'index' : 'equity',
    exchange: 'NSE',
    isin,
    sector: resolved.sector || 'Equities',
    tradingDate: indicators?.tradingDate ?? null,
    close,
    changePercent: indicators?.changePercent ?? null,
    high: indicators?.high ?? close,
    low: indicators?.low ?? close,
    volume: indicators?.volume ?? 0,
    high52w: indicators?.high52w ?? null,
    low52w: indicators?.low52w ?? null,
    ema20: indicators?.ema20 ?? null,
    ema50: indicators?.ema50 ?? null,
    ema200: indicators?.ema200 ?? null,
    sma20: indicators?.sma20 ?? null,
    sma50: indicators?.sma50 ?? null,
    rsi14: indicators?.rsi14 ?? null,
    macdHistogram: indicators?.macdHistogram ?? null,
    atr14: indicators?.atr14 ?? null,
    averageVolume: indicators?.averageVolume ?? null,
    relativeVolume: indicators?.relativeVolume ?? null,
    corporateActions: actions,
    peers: peers.slice(0, 6),
  };
}
