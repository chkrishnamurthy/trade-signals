import { daysHeldBetween, type ShareChange } from './derive.js';
import { daysToLongTerm } from './tax.js';

/**
 * In-app notices about the user's own holdings (phase 6.2). Pure: the worker
 * passes everything in, including today. Each notice states a fact about a
 * stock the user holds; none tells them what to do. The facts are numbers and
 * dates; the page words them, so money becomes text only there (rule 3).
 *
 *   event_soon      a dividend ex-date, bonus, split, results or meeting within
 *                   EVENT_DAYS_AHEAD days
 *   share_change    a split, bonus or consolidation that took effect in the last
 *                   SHARE_CHANGE_DAYS_BACK days, with the share count now
 *   stock_move      a held stock's last session moved by the user's level or more
 *   portfolio_move  the holdings together moved by the user's level or more
 *   long_term_soon  a purchase still held passes 12 months within the user's days
 */

export interface NoticeSettings {
  readonly events: boolean;
  readonly shareChanges: boolean;
  readonly stockMoves: boolean;
  /** Whole percent, 1–50. */
  readonly stockMovePercent: number;
  readonly portfolioMoves: boolean;
  readonly portfolioMovePercent: number;
  readonly longTerm: boolean;
  /** 1–90. */
  readonly longTermDays: number;
}

export const DEFAULT_NOTICE_SETTINGS: NoticeSettings = {
  events: true,
  shareChanges: true,
  stockMoves: true,
  stockMovePercent: 5,
  portfolioMoves: true,
  portfolioMovePercent: 3,
  longTerm: true,
  longTermDays: 7,
};

export const EVENT_DAYS_AHEAD = 3;
export const SHARE_CHANGE_DAYS_BACK = 3;
/** A close older than this many days is not "today's move". */
export const MOVE_FRESH_DAYS = 4;
/** A portfolio move needs this share of the priced holdings to have that session's close. */
export const PORTFOLIO_MOVE_COVERAGE = 0.8;

export type NoticeKind =
  | 'event_soon'
  | 'share_change'
  | 'stock_move'
  | 'portfolio_move'
  | 'long_term_soon';

export interface Notice {
  readonly kind: NoticeKind;
  readonly instrumentId: number | null;
  /** Once-only per owner and kind. */
  readonly dedupeKey: string;
  /** The day the notice is about. */
  readonly noticeDate: string;
  readonly data: Readonly<Record<string, string | number | null>>;
}

export interface NoticeInput {
  readonly today: string;
  readonly settings: NoticeSettings;
  /** What the user holds now, shares on today's basis. */
  readonly holdings: readonly {
    readonly instrumentId: number;
    readonly symbol: string;
    readonly name: string;
    readonly shares: number;
  }[];
  /** Calendar events for held stocks from today to EVENT_DAYS_AHEAD days on. */
  readonly events: readonly {
    readonly instrumentId: number;
    readonly eventType: string;
    readonly eventDate: string;
    readonly title: string;
    readonly dividendPaise: number | null;
  }[];
  /** Splits, bonuses and consolidations that have taken effect (ex-date ≤ today). */
  readonly changes: readonly ShareChange[];
  /** Each held stock's last two closes and the session of the last. */
  readonly closes: ReadonlyMap<
    number,
    {
      readonly closePaise: number;
      readonly previousClosePaise: number | null;
      readonly session: string;
    }
  >;
  /** Purchases still held (tax lots: bonus shares are their own). */
  readonly lots: readonly {
    readonly instrumentId: number;
    readonly acquiredOn: string;
    readonly trackedFrom: string;
    readonly shares: number;
    readonly bonus: boolean;
  }[];
}

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The previous close restated across a split or bonus that took effect on `session`. */
function comparablePrevious(
  previous: number,
  session: string,
  changes: readonly ShareChange[],
  instrumentId: number,
): number {
  let p = previous;
  for (const c of changes)
    if (
      c.instrumentId === instrumentId &&
      SHARE_CHANGING.has(c.kind) &&
      c.ratio > 0 &&
      c.exDate === session
    )
      p *= c.ratio;
  return p;
}

export function holdingNotices(input: NoticeInput): Notice[] {
  const { today, settings } = input;
  const out: Notice[] = [];
  const held = new Map(input.holdings.filter((h) => h.shares > 0).map((h) => [h.instrumentId, h]));

  if (settings.events) {
    const until = addDays(today, EVENT_DAYS_AHEAD);
    for (const e of input.events) {
      const h = held.get(e.instrumentId);
      if (h === undefined || e.eventDate < today || e.eventDate > until) continue;
      out.push({
        kind: 'event_soon',
        instrumentId: e.instrumentId,
        dedupeKey: `${e.instrumentId}|${e.eventType}|${e.eventDate}`,
        noticeDate: e.eventDate,
        data: {
          symbol: h.symbol,
          name: h.name,
          eventType: e.eventType,
          eventDate: e.eventDate,
          title: e.title,
          dividendPaise: e.dividendPaise,
          shares: h.shares,
          daysAway: daysHeldBetween(today, e.eventDate),
        },
      });
    }
  }

  if (settings.shareChanges) {
    const from = addDays(today, -SHARE_CHANGE_DAYS_BACK);
    for (const c of input.changes) {
      const h = held.get(c.instrumentId);
      if (h === undefined || !SHARE_CHANGING.has(c.kind) || c.exDate < from || c.exDate > today)
        continue;
      out.push({
        kind: 'share_change',
        instrumentId: c.instrumentId,
        dedupeKey: `${c.instrumentId}|${c.kind}|${c.exDate}`,
        noticeDate: c.exDate,
        data: {
          symbol: h.symbol,
          name: h.name,
          changeKind: c.kind,
          exDate: c.exDate,
          ratio: c.ratio,
          sharesNow: h.shares,
        },
      });
    }
  }

  // Moves: only on a fresh session, and the portfolio only over stocks with that session.
  const fresh = addDays(today, -MOVE_FRESH_DAYS);
  let latest: string | null = null;
  for (const [id, c] of input.closes)
    if (held.has(id) && c.session >= fresh && (latest === null || c.session > latest))
      latest = c.session;
  let now = 0;
  let before = 0;
  let counted = 0;
  let priced = 0;
  for (const [id, c] of input.closes) {
    const h = held.get(id);
    if (h === undefined || c.previousClosePaise === null || c.previousClosePaise <= 0) continue;
    priced += 1;
    if (latest === null || c.session !== latest) continue;
    const prev = comparablePrevious(c.previousClosePaise, c.session, input.changes, id);
    const change = c.closePaise / prev - 1;
    now += h.shares * c.closePaise;
    before += h.shares * prev;
    counted += 1;
    if (settings.stockMoves && Math.abs(change) * 100 >= settings.stockMovePercent) {
      out.push({
        kind: 'stock_move',
        instrumentId: id,
        dedupeKey: `${id}|${c.session}`,
        noticeDate: c.session,
        data: {
          symbol: h.symbol,
          name: h.name,
          session: c.session,
          changeRatio: change,
          closePaise: c.closePaise,
          // Value change on the shares held, in paise.
          valueChangePaise: Math.round(h.shares * (c.closePaise - prev)),
        },
      });
    }
  }
  // Not a move of "your holdings" when most of them have no close that day.
  const covered = priced > 0 && counted / priced >= PORTFOLIO_MOVE_COVERAGE;
  if (settings.portfolioMoves && latest !== null && covered && before > 0) {
    const change = now / before - 1;
    if (Math.abs(change) * 100 >= settings.portfolioMovePercent) {
      out.push({
        kind: 'portfolio_move',
        instrumentId: null,
        dedupeKey: latest,
        noticeDate: latest,
        data: {
          session: latest,
          changeRatio: change,
          valueChangePaise: Math.round(now - before),
          stocks: counted,
        },
      });
    }
  }

  if (settings.longTerm) {
    for (const lot of input.lots) {
      const h = held.get(lot.instrumentId);
      if (h === undefined || lot.shares <= 0) continue;
      const days = daysToLongTerm(lot.acquiredOn, today);
      if (days < 1 || days > settings.longTermDays) continue;
      out.push({
        kind: 'long_term_soon',
        instrumentId: lot.instrumentId,
        dedupeKey: `${lot.instrumentId}|${lot.acquiredOn}|${lot.trackedFrom}|${lot.bonus ? 'bonus' : 'paid'}`,
        noticeDate: addDays(today, days),
        data: {
          symbol: h.symbol,
          name: h.name,
          acquiredOn: lot.acquiredOn,
          shares: lot.shares,
          bonus: lot.bonus ? 1 : 0,
          longTermOn: addDays(today, days),
          daysAway: days,
        },
      });
    }
  }
  return out;
}
