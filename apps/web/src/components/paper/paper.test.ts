import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActivityList, sizingSentence } from './activity-card';
import {
  closedWinner,
  simulatedActivity,
  simulatedOverview,
  simulatedPerformance,
  stoppedOut,
  waitingForPrice,
} from './fixture';
import { reasonLabel, timesRisked, tradeStatus } from './format';
import { OpenTradesCard } from './open-trades-card';
import { StateBanners } from './paper-dashboard';
import { PaperStatus } from './paper-status-card';
import { PerformanceReport } from './performance-card';
import { SummaryCards } from './summary-cards';
import { TradesTable } from './trades-table';

const overview = simulatedOverview();
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
/** Vocabulary rule (CLAUDE.md): technical levels and simulated shares, never order words or the letter R. */
const clean = (out: string) => {
  expect(out).not.toMatch(/\b(order|orders|quantity|position|positions|entry price)\b/i);
  expect(out).not.toMatch(/\d(\.\d)?R\b/);
};

describe('paper trading cards', () => {
  it('fixture trades come out of the real engine with the worked-example numbers', () => {
    const w = closedWinner();
    expect(w.projection.shares).toBe(23);
    expect(w.grossRealisedPaise).toBe(73_600);
    expect(w.chargesPaise).toBe(7_285);
    expect(w.netRealisedPaise).toBe(66_315);
    expect(tradeStatus(w)).toEqual({ label: 'Target 2 hit', tone: 'bullish' });
    expect(tradeStatus(stoppedOut())).toEqual({ label: 'Stopped out', tone: 'bearish' });
    expect(tradeStatus(waitingForPrice())).toEqual({
      label: 'Waiting for next price',
      tone: 'secondary',
    });
  });
  it('the trades table shows levels, simulated shares and net results in plain words', () => {
    const out = html(
      createElement(TradesTable, { trades: [closedWinner(), stoppedOut()], emptyText: '' }),
    );
    for (const text of [
      'RELIANCE',
      '₹2,957.10',
      '× 23',
      '₹2,934.50',
      '₹2,978.30',
      '₹3,000.20',
      '+₹663.15',
      'Target 2 hit',
      'Stopped out',
    ])
      expect(out).toContain(text);
    expect(out).toContain('the amount risked');
    clean(out);
  });
  it('open trades card explains every empty state', () => {
    expect(html(createElement(OpenTradesCard, { data: overview }))).toContain('TATASTEEL');
    const empty = (o: Parameters<typeof simulatedOverview>[0]) =>
      html(createElement(OpenTradesCard, { data: simulatedOverview({ openTrades: [], ...o }) }));
    expect(empty({ phase: 'CLOSED' })).toContain('Market closed');
    expect(empty({ phase: 'OPENING_RANGE' })).toContain('Opening range forming');
    expect(empty({ settings: { ...overview.settings, enabled: false } })).toContain(
      'Paper trading is off',
    );
    expect(
      empty({ assignments: [{ strategyId: 'orb-vc', enabled: false, priority: 10 }] }),
    ).toContain('No strategy is enabled');
  });
  it('summary cards read the stored balances', () => {
    const out = html(createElement(SummaryCards, { data: overview }));
    expect(out).toContain('₹2,00,775.14');
    expect(out).toContain('₹1,25,650.00');
    expect(out).toContain('2 of 3');
    clean(out);
  });
  it('activity explains why shares were sized and why a signal was declined', () => {
    const activity = simulatedActivity();
    const out = html(createElement(ActivityList, { data: activity }));
    expect(out).toContain('Declined · Maximum open paper trades');
    expect(out).toContain('Taken · 23 shares');
    expect(out).toContain('Target 1 reached');
    expect(sizingSentence(activity.decisions[0]!)).toContain(
      'limited by the per-trade exposure cap',
    );
    expect(reasonLabel('SIGNAL_BEFORE_ACTIVATION')).toBe('Signal came before you switched on');
    clean(out);
  });
  it('performance shows the interval, sample-size warning and net-of-charges label', () => {
    const out = html(createElement(PerformanceReport, { report: simulatedPerformance() }));
    expect(out).toContain('Too few trades to judge');
    expect(out).toContain('60% (likely 31%–83%)');
    expect(out).toContain('0.35× the amount risked');
    expect(out).toContain('Target 2');
    clean(out);
  });
  it('status card and banners cover the designed states', () => {
    const on = html(createElement(PaperStatus, { data: overview }));
    expect(on).toContain('ON');
    expect(on).toContain('ORB-VC');
    const off = html(
      createElement(PaperStatus, {
        data: simulatedOverview({
          settings: { ...overview.settings, enabled: false, enabledAt: null },
        }),
      }),
    );
    expect(off).toContain('Switch on to simulate these signals on ₹2,00,000.00');
    const banners = html(
      createElement(StateBanners, {
        data: simulatedOverview({
          feed: { ...overview.feed, mode: 'STALE', workerDelayed: true },
          halts: [
            {
              id: 1,
              at: overview.serverNow,
              kind: 'DAILY_LOSS_HALT',
              detail: {},
              resolvedAt: null,
            },
          ],
        }),
      }),
    );
    expect(banners).toContain('Price feed stale');
    expect(banners).toContain('Worker delayed');
    expect(banners).toContain('Daily loss limit reached');
    expect(html(createElement(StateBanners, { data: overview }))).toBe('');
  });
  it('format helpers never print the letter R', () => {
    expect(timesRisked(66_315, 51_980)).toBe('1.3× the amount risked');
    expect(timesRisked(null, 1)).toBeNull();
  });
});
