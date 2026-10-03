import { METRIC_KEYS } from '@equitywise/core';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { compileFilter, snakeCase, snapshotHasColumn } from './screener.js';

const dialect = new PgDialect({ casing: 'snake_case' });
const render = (node: Parameters<typeof compileFilter>[0]) =>
  dialect.sqlToQuery(compileFilter(node));

describe('screener snapshot table', () => {
  it('has a column for every catalogue metric', () => {
    const missing = METRIC_KEYS.filter((key) => !snapshotHasColumn(key));
    expect(missing).toEqual([]);
  });
});

describe('snakeCase', () => {
  it('matches the column names the migration created', () => {
    // Every pair below is a real column in 0032_stock_analysis.sql.
    expect(snakeCase('buildId')).toBe('build_id');
    expect(snakeCase('dist52wHigh')).toBe('dist52w_high');
    expect(snakeCase('rsiAbove60Days')).toBe('rsi_above60_days');
    expect(snakeCase('ret1w')).toBe('ret1w');
    expect(snakeCase('avgVolume20')).toBe('avg_volume20');
  });

  it('agrees with drizzle for every snapshot column', () => {
    const dialect2 = new PgDialect({ casing: 'snake_case' });
    for (const key of METRIC_KEYS) {
      const rendered = dialect2.sqlToQuery(
        compileFilter({ metric: key, cmp: 'gt', value: 0 } as never),
      ).sql;
      if (rendered.includes('"screener_snapshots"')) {
        expect(rendered).toContain(`"screener_snapshots"."${snakeCase(key)}"`);
      }
    }
  });
});

describe('compileFilter', () => {
  it('binds values as parameters, never as text', () => {
    const q = render({ metric: 'rsi14', cmp: 'gte', value: 60 });
    expect(q.sql).toBe('("screener_snapshots"."rsi14" >= $1)');
    expect(q.params).toEqual([60]);
  });

  it('compiles groups with explicit parentheses', () => {
    const q = render({
      op: 'and',
      children: [
        { metric: 'closeVsEma200', cmp: 'gt', value: 0 },
        {
          op: 'or',
          children: [
            { metric: 'breakout20d', cmp: 'is', value: true },
            { metric: 'rsiAbove60Days', cmp: 'within', value: 3 },
          ],
        },
      ],
    });
    expect(q.sql).toBe(
      '(("screener_snapshots"."close_vs_ema200" > $1) AND (("screener_snapshots"."breakout20d" = $2) OR ("screener_snapshots"."rsi_above60_days" BETWEEN 0 AND $3)))',
    );
    expect(q.params).toEqual([0, true, 3]);
  });

  it('uses array overlap for index membership and ANY for enums', () => {
    expect(render({ metric: 'indexKeys', cmp: 'in', value: ['nifty50', 'nifty100'] }).sql).toBe(
      '("screener_snapshots"."index_keys" && ARRAY[$1, $2]::text[])',
    );
    expect(render({ metric: 'oiBuildup', cmp: 'in', value: ['long_buildup'] }).sql).toBe(
      '("screener_snapshots"."oi_buildup" = ANY(ARRAY[$1]::text[]))',
    );
  });

  it('compares two metrics column to column', () => {
    expect(render({ metric: 'closeVsEma20', cmp: 'gt', rhsMetric: 'closeVsEma50' }).sql).toBe(
      '("screener_snapshots"."close_vs_ema20" > "screener_snapshots"."close_vs_ema50")',
    );
  });

  it('refuses a leaf it cannot compile rather than dropping it', () => {
    expect(() => render({ metric: 'rsi14', cmp: 'is', value: [1] as never })).toThrow();
  });
});
