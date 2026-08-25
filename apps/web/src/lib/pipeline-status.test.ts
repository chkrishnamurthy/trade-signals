import { describe, expect, it } from 'vitest';
import type { IntradayRunDto } from './intraday-types';
import type { MarketStateDto } from './market-types';
import { derivePipelineStatus, PROCESSING_GRACE_MS, STOPPED_AFTER_MS } from './pipeline-status';

/**
 * This module is the only thing standing between "the worker died at 10am"
 * and a page that still says Live Processing at 2pm. Each case pins a
 * boundary this feature exists to get right — including the incident that
 * prompted the 'unknown' state: a real run stuck 25+ minutes with the market
 * status lookup itself failing, which the naive `isOpen ?? false` read as
 * "market closed" rather than "we don't know."
 */

const OPEN: MarketStateDto = { isOpen: true, phase: 'open' };
const CLOSED: MarketStateDto = { isOpen: false, phase: 'closed' };
const PRE_OPEN: MarketStateDto = { isOpen: false, phase: 'pre_open' };
const STATUS_UNKNOWN: MarketStateDto = { isOpen: false, phase: 'unknown' };

const NOW = Date.parse('2026-08-25T06:00:00.000Z');

function run(overrides: Partial<IntradayRunDto>): IntradayRunDto {
  return {
    startedAt: new Date(NOW - 20_000).toISOString(),
    finishedAt: new Date(NOW - 5_000).toISOString(),
    status: 'ok',
    regime: 'mid',
    symbolsRequested: 50,
    symbolsEvaluated: 50,
    signalsCreated: 0,
    signalsUpdated: 0,
    skippedCount: 0,
    error: null,
    ...overrides,
  };
}

describe('derivePipelineStatus', () => {
  it('is closed whenever the market is closed, regardless of the run', () => {
    const status = derivePipelineStatus({ market: CLOSED, run: run({}), stale: false, now: NOW });
    expect(status.state).toBe('closed');
  });

  it('tells pre-open apart from post-close', () => {
    const before = derivePipelineStatus({ market: PRE_OPEN, run: null, stale: false, now: NOW });
    expect(before.detail).toMatch(/9:15/);
    const after = derivePipelineStatus({ market: CLOSED, run: null, stale: false, now: NOW });
    expect(after.detail).not.toMatch(/9:15/);
  });

  it('is starting when the market is open but no run exists yet', () => {
    const status = derivePipelineStatus({ market: OPEN, run: null, stale: false, now: NOW });
    expect(status.state).toBe('starting');
  });

  it('is error when the last run failed, even if it finished recently', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ status: 'failed', error: 'ECONNREFUSED' }),
      stale: false,
      now: NOW,
    });
    expect(status.state).toBe('error');
    expect(status.detail).toBe('ECONNREFUSED');
  });

  it('is processing while a cycle is in flight', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ finishedAt: null, startedAt: new Date(NOW - 5_000).toISOString() }),
      stale: false,
      now: NOW,
    });
    expect(status.state).toBe('processing');
  });

  it('is live when a recent pass finished cleanly and the feed is not stale', () => {
    const status = derivePipelineStatus({ market: OPEN, run: run({}), stale: false, now: NOW });
    expect(status.state).toBe('live');
    expect(status.tone).toBe('positive');
  });

  it('is delayed when the server marks the feed stale', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ finishedAt: new Date(NOW - 8 * 60_000).toISOString() }),
      stale: true,
      now: NOW,
    });
    expect(status.state).toBe('delayed');
  });

  it('escalates to stopped once the last activity is older than the stopped threshold', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ finishedAt: new Date(NOW - STOPPED_AFTER_MS - 1_000).toISOString() }),
      stale: true,
      now: NOW,
    });
    expect(status.state).toBe('stopped');
  });

  it('does not report processing as live-forever if a cycle hangs past the stopped threshold', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({
        finishedAt: null,
        startedAt: new Date(NOW - STOPPED_AFTER_MS - 1_000).toISOString(),
      }),
      stale: true,
      now: NOW,
    });
    expect(status.state).toBe('stopped');
  });

  it('flags market data as absent when symbols were requested but none evaluated', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ symbolsRequested: 50, symbolsEvaluated: 0 }),
      stale: false,
      now: NOW,
    });
    expect(status.marketData).toBe('no_data');
  });

  it('flags market data as receiving when the last run evaluated symbols', () => {
    const status = derivePipelineStatus({ market: OPEN, run: run({}), stale: false, now: NOW });
    expect(status.marketData).toBe('receiving');
  });

  it('leaves market data unknown when there is no run at all', () => {
    const status = derivePipelineStatus({ market: OPEN, run: null, stale: false, now: NOW });
    expect(status.marketData).toBe('unknown');
  });

  it('is unknown — not closed — when the market status lookup itself failed', () => {
    const status = derivePipelineStatus({
      market: STATUS_UNKNOWN,
      run: run({}),
      stale: false,
      now: NOW,
    });
    expect(status.state).toBe('unknown');
    expect(status.state).not.toBe('closed');
    expect(status.market).toBe('unknown');
  });

  it('treats an in-flight run past the processing grace as delayed, not still processing', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({
        finishedAt: null,
        startedAt: new Date(NOW - PROCESSING_GRACE_MS - 1_000).toISOString(),
      }),
      stale: true,
      now: NOW,
    });
    expect(status.state).toBe('delayed');
  });

  it('stays processing for an in-flight run comfortably inside the grace window', () => {
    const status = derivePipelineStatus({
      market: OPEN,
      run: run({ finishedAt: null, startedAt: new Date(NOW - 20_000).toISOString() }),
      stale: false,
      now: NOW,
    });
    expect(status.state).toBe('processing');
  });
});
