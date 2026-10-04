import 'server-only';
import {
  catalogueFor,
  defaultRatioKeys,
  ema,
  explainMatch,
  INDEX_OPTIONS,
  keyPoints,
  RATIO_EXTRAS,
  validateFilter,
} from '@equitywise/core';
import {
  deliveryHistory,
  derivativeOiHistory,
  dividendHistory,
  getAnnouncements,
  getDailyBars,
  getInstrumentBySymbol,
  getRecentDeals,
  getSignalFactors,
  industryPeers,
  instrumentReferenceFor,
  latestSignalRow,
  listCorporateActions,
  marketEventsForInstrument,
  shareholdingHistory,
  snapshotForInstrument,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { ScreenerCellValue } from '@/lib/screener-types';
import type { LevelDto, StockPageDto } from '@/lib/stock-types';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';
import { ratioLayoutFor } from './ratio-layout';
import { toRowDto } from './screener';
import { decodeFilterParam } from './screener-schemas';

/**
 * The stock page's composition service (plan §6, §10.1).
 *
 * Reads only stored data — the nightly snapshot, adjusted daily candles,
 * delivery, deals, OI, shareholding, announcements and events — in parallel.
 * A page view never calls a market-data provider. Each section degrades on
 * its own: a failed read becomes an empty section, not a broken page.
 */

const CHART_BARS = 500;

/** A section read that must not take the page down with it. */
async function soft<T>(read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch {
    return fallback;
  }
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getStockResearchPage(
  rawSymbol: string,
  options: { screen?: string | undefined; screenName?: string | undefined } = {},
): Promise<StockPageDto | null> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  const isAdmin = user.role === 'admin';
  const db = getDatabase();
  const instrument = await getInstrumentBySymbol(db, rawSymbol.trim().toUpperCase());
  if (instrument === null) return null;

  const today = istDateKey(new Date());
  const [
    snapshot,
    bars,
    actions,
    delivery,
    deals,
    oi,
    holdings,
    announcements,
    events,
    signalRow,
    reference,
    dividends,
  ] = await Promise.all([
    soft(snapshotForInstrument(db, instrument.id), null),
    soft(
      getDailyBars(db, {
        instrumentId: instrument.id,
        from: new Date(0),
        to: new Date(),
        limit: CHART_BARS,
      }),
      [],
    ),
    soft(listCorporateActions(db, instrument.id, 10), []),
    soft(deliveryHistory(db, instrument.id, 60), []),
    soft(getRecentDeals(db, { instrumentIds: [instrument.id] }), []),
    soft(derivativeOiHistory(db, instrument.id, 40), []),
    soft(shareholdingHistory(db, instrument.id, 8), []),
    soft(getAnnouncements(db, { symbols: [instrument.symbol], limit: 12 }), {
      rows: [],
      total: 0,
    }),
    soft(
      marketEventsForInstrument(db, {
        instrumentId: instrument.id,
        from: shift(today, -120),
        to: shift(today, 90),
      }),
      [],
    ),
    isAdmin ? soft(latestSignalRow(db, instrument.id), null) : Promise.resolve(null),
    soft(instrumentReferenceFor(db, instrument.id), null),
    soft(dividendHistory(db, instrument.id, 12), []),
  ]);

  const row = snapshot === null ? null : toRowDto(snapshot, isAdmin);
  // dataIssue rides with the values so every reader (technicals, key points) sees it.
  const values: Readonly<Record<string, ScreenerCellValue>> | null =
    row === null ? null : { ...row.values, dataIssue: row.dataIssue };
  const fnoEligible = values?.fnoEligible === true;
  const layout = await soft(ratioLayoutFor({ userId: user.id, isAdmin }, fnoEligible), {
    keys: defaultRatioKeys(fnoEligible),
    saved: false,
  });
  const industry = snapshot?.industry ?? null;
  const peers =
    snapshot === null || industry === null
      ? []
      : await soft(
          industryPeers(db, {
            tradingDate: snapshot.tradingDate,
            industry,
            excludeInstrumentId: instrument.id,
            limit: 6,
          }),
          [],
        );

  const closes = bars.map((b) => b.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);

  const signal =
    signalRow === null
      ? null
      : {
          date: signalRow.tradingDate,
          direction: signalRow.direction,
          strength: signalRow.strength,
          factors: (await soft(getSignalFactors(db, signalRow.id), [])).map((f) => ({
            label: f.label,
            score: f.score,
            weight: f.weight,
            detail: f.detail,
          })),
        };

  // "Matched because": the screen the user came from, evaluated against the
  // same stored values the screener used — never recomputed.
  let match: StockPageDto['match'] = null;
  const filter = decodeFilterParam(options.screen);
  if (filter !== null && values !== null && validateFilter(filter, { isAdmin }).length === 0) {
    const reasons = explainMatch(filter, values);
    match = {
      screenName: options.screenName?.slice(0, 80) ?? null,
      reasons,
      matched: reasons.length > 0,
    };
  }

  const indexKeys = Array.isArray(values?.indexKeys) ? (values.indexKeys as readonly string[]) : [];
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    isin: instrument.isin,
    series: snapshot?.series ?? reference?.series ?? null,
    industry,
    indexLabels: INDEX_OPTIONS.filter((o) => indexKeys.includes(o.value)).map((o) => o.label),
    indices: INDEX_OPTIONS.filter((o) => indexKeys.includes(o.value)).map((o) => ({
      key: o.value,
      label: o.label,
    })),
    listingDate: reference?.listingDate ?? null,
    faceValuePaise: reference?.faceValuePaise ?? null,
    industrySource: reference?.industrySource ?? null,
    ratioKeys: layout.keys,
    ratioSaved: layout.saved,
    ratioExtras: Object.entries(RATIO_EXTRAS).map(([key, e]) => ({
      key,
      label: e.label,
      description: e.description,
    })),
    keyPoints: keyPoints(values).map(({ salience: _salience, ...p }) => p),
    dividends: dividends.map((d) => ({
      exDate: d.exDate,
      kind: d.kind,
      amountPaise: d.amountPaise,
    })),
    session: snapshot?.tradingDate ?? null,
    stale:
      snapshot === null ||
      Date.parse(`${today}T00:00:00Z`) - Date.parse(`${snapshot.tradingDate}T00:00:00Z`) >
        4 * 86_400_000,
    values,
    metrics: catalogueFor(isAdmin).map((d) => ({
      key: d.key,
      label: d.label,
      category: d.category,
      unit: d.unit,
      description: d.description,
      decimals: d.decimals ?? null,
      options: d.options ?? null,
    })),
    bars: bars.map((b) => ({
      t: b.timestamp,
      o: b.open,
      h: b.high,
      l: b.low,
      c: b.close,
      v: b.volume,
    })),
    ema20: e20,
    ema50: e50,
    corporateActions: actions.map((a) => ({
      exDate: a.exDate,
      kind: a.kind,
      ratio: a.ratio,
      note: a.note,
    })),
    delivery: [...delivery]
      .reverse()
      .map((d) => ({ date: d.tradingDate, pct: d.deliveryPercent, qty: d.deliverableQty })),
    deals: deals.slice(0, 12).map((d) => ({
      date: d.tradingDate,
      type: d.dealType,
      client: d.clientName,
      side: d.side,
      quantity: d.quantity,
      price: d.price,
    })),
    oi: [...oi].reverse().map((o) => ({
      date: o.tradingDate,
      oi: o.futuresOi,
      change: o.oiChange,
      buildup: o.buildup,
      futuresClose: o.futuresClosePaise,
    })),
    shareholding: [...holdings]
      .reverse()
      .map((h) => ({ asOf: h.asOfDate, promoter: h.promoterPercent, public: h.publicPercent })),
    announcements: announcements.rows.map((a) => ({
      id: a.id,
      at: a.announcedAt.toISOString(),
      headline: a.headline,
      category: a.category,
      url: a.attachmentUrl,
    })),
    events: events.map((e) => ({ date: e.eventDate, type: e.eventType, title: e.title })),
    peers: peers.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      close: p.close,
      changePct: p.changePct,
      ret3m: p.ret3m,
      rsRank: p.rsRank,
    })),
    levels: levelsFrom(snapshot, bars),
    match,
    signal,
  };
}

/**
 * Technical levels from stored values: 52-week and 20-session extremes, the
 * key EMAs and the classic floor pivots of the last session
 * (P = (H+L+C)/3, R1 = 2P − L, S1 = 2P − H). Paise throughout.
 */
function levelsFrom(
  snapshot: Awaited<ReturnType<typeof snapshotForInstrument>>,
  bars: readonly { high: number; low: number; close: number }[],
): LevelDto[] {
  if (snapshot === null) return [];
  const out: LevelDto[] = [];
  const add = (label: string, paise: number | null, note: string | null = null) => {
    if (paise !== null) out.push({ label, paise, note });
  };
  const last = bars[bars.length - 1];
  add('52-week high', snapshot.high52w);
  if (last !== undefined) {
    const p = (last.high + last.low + last.close) / 3;
    add('Pivot R1', Math.round(2 * p - last.low));
    add('Pivot', Math.round(p));
    add('Pivot S1', Math.round(2 * p - last.high));
  }
  add('20-session high', snapshot.high20d, snapshot.breakout20d === true ? 'closed above' : null);
  add('EMA 50', snapshot.ema50);
  add('EMA 200', snapshot.ema200);
  add('20-session low', snapshot.low20d, snapshot.breakdown20d === true ? 'closed below' : null);
  add('52-week low', snapshot.low52w);
  return out.sort((a, b) => b.paise - a.paise);
}
