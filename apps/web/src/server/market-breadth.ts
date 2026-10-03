import 'server-only';
import {
  breadthHistory,
  industryAggregates,
  latestSnapshotBuild,
  type SnapshotRow,
  snapshotLeaders,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * `/markets/breadth` (plan §7): participation, not just the index level.
 * Everything is read from the nightly breadth rows and the snapshot; nothing
 * is computed per request beyond sorting and ratios.
 */

export interface BreadthDayDto {
  readonly date: string;
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly above20Pct: number | null;
  readonly above50Pct: number | null;
  readonly above200Pct: number | null;
  readonly newHighs: number;
  readonly newLows: number;
}

export interface LeaderDto {
  readonly symbol: string;
  readonly name: string;
  readonly industry: string | null;
  readonly changePct: number | null;
  readonly metric: number | null;
}

export interface MarketBreadthDto {
  readonly universe: 'all' | 'nifty500';
  readonly session: string | null;
  readonly builtAt: string | null;
  readonly stale: boolean;
  readonly history: readonly BreadthDayDto[];
  readonly industries: readonly {
    industry: string;
    stocks: number;
    change1d: number | null;
    ret1w: number | null;
    ret1m: number | null;
    ret3m: number | null;
    above50Pct: number | null;
  }[];
  readonly leaders: {
    readonly delivery: readonly LeaderDto[];
    readonly volume: readonly LeaderDto[];
    readonly buildup: readonly LeaderDto[];
    readonly highs: readonly LeaderDto[];
  };
}

const pct = (part: number, base: number) => (base === 0 ? null : (part / base) * 100);

function leader(row: SnapshotRow, metric: number | null): LeaderDto {
  return {
    symbol: row.symbol,
    name: row.name,
    industry: row.industry,
    changePct: row.changePct,
    metric,
  };
}

export async function getMarketBreadth(universe: 'all' | 'nifty500'): Promise<MarketBreadthDto> {
  if ((await getSessionUser()) === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  const db = getDatabase();
  const build = await latestSnapshotBuild(db);
  if (build === null) {
    return {
      universe,
      session: null,
      builtAt: null,
      stale: true,
      history: [],
      industries: [],
      leaders: { delivery: [], volume: [], buildup: [], highs: [] },
    };
  }
  const session = build.tradingDate;
  const from = new Date(`${session}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 380);
  const scope =
    universe === 'nifty500'
      ? { metric: 'indexKeys' as const, cmp: 'in' as const, value: ['nifty500'] }
      : null;
  const withScope = (extra: Parameters<typeof snapshotLeaders>[1]['filter']) =>
    scope === null
      ? extra
      : extra === null
        ? scope
        : { op: 'and' as const, children: [scope, extra] };

  const [history, industries, delivery, volume, buildup, highs] = await Promise.all([
    breadthHistory(db, { universe, from: from.toISOString().slice(0, 10) }),
    industryAggregates(db, session),
    snapshotLeaders(db, {
      tradingDate: session,
      metric: 'deliveryRatio',
      filter: withScope({
        op: 'and',
        children: [
          { metric: 'changePct', cmp: 'gt', value: 0 },
          { metric: 'relVolume', cmp: 'gte', value: 1.5 },
        ],
      }),
      limit: 6,
    }),
    snapshotLeaders(db, {
      tradingDate: session,
      metric: 'relVolume',
      filter: withScope({ metric: 'turnover', cmp: 'gte', value: 10_000_000_000 }),
      limit: 6,
    }),
    snapshotLeaders(db, {
      tradingDate: session,
      metric: 'futOiChgPct',
      filter: withScope({ metric: 'oiBuildup', cmp: 'is', value: 'long_buildup' }),
      limit: 6,
    }),
    snapshotLeaders(db, {
      tradingDate: session,
      metric: 'relVolume',
      filter: withScope({ metric: 'breakout52w', cmp: 'is', value: true }),
      limit: 6,
    }),
  ]);

  const today = Date.parse(`${istDateKey(new Date())}T00:00:00Z`);
  return {
    universe,
    session,
    builtAt: build.finishedAt?.toISOString() ?? null,
    stale: today - Date.parse(`${session}T00:00:00Z`) > 4 * 86_400_000,
    history: history.map((d) => ({
      date: d.tradingDate,
      advances: d.advances,
      declines: d.declines,
      unchanged: d.unchanged,
      above20Pct: pct(d.above20, d.base20),
      above50Pct: pct(d.above50, d.base50),
      above200Pct: pct(d.above200, d.base200),
      newHighs: d.newHighs,
      newLows: d.newLows,
    })),
    industries,
    leaders: {
      delivery: delivery.map((r) => leader(r, r.deliveryPct)),
      volume: volume.map((r) => leader(r, r.relVolume)),
      buildup: buildup.map((r) => leader(r, r.futOiChgPct)),
      highs: highs.map((r) => leader(r, r.relVolume)),
    },
  };
}
