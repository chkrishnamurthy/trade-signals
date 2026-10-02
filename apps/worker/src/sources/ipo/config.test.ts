import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { boardForSeries, parseIpoSourcesConfig, sourceFor } from './config.js';

const real = (): Record<string, unknown> =>
  parse(readFileSync(new URL('../../../../../config/ipo-sources.yaml', import.meta.url), 'utf8'));

describe('config/ipo-sources.yaml', () => {
  it('the committed file is valid', () => {
    const config = parseIpoSourcesConfig(real());
    expect(sourceFor(config, 'nse', 'detail')?.minIntervalMs).toBeGreaterThanOrEqual(2_000);
    expect(sourceFor(config, 'investorgain', 'gmp')?.kind).toBe('aggregator');
    // An aggregator can never be asked for an official feed.
    expect(sourceFor(config, 'investorgain', 'detail')).toBeNull();
    expect(boardForSeries(config, 'eq')).toBe('mainboard');
    expect(boardForSeries(config, 'SM')).toBe('sme');
    expect(boardForSeries(config, 'DEBT')).toBeNull();
  });

  const withSource = (patch: Record<string, unknown>) => {
    const raw = real();
    const sources = raw.sources as Record<string, Record<string, unknown>>;
    sources.investorgain = { ...sources.investorgain, ...patch };
    return raw;
  };

  it('rejects an aggregator carrying an official feed', () => {
    expect(() => parseIpoSourcesConfig(withSource({ feeds: ['gmp', 'detail'] }))).toThrow(
      /only carry the gmp feed/,
    );
  });
  it('rejects an aggregator posing as a browser', () => {
    expect(() => parseIpoSourcesConfig(withSource({ userAgent: 'browser' }))).toThrow(
      /identify honestly/,
    );
  });
  it('rejects an aggregator in the field priority', () => {
    const raw = real();
    (raw.fieldPriority as { fallback: string[] }).fallback.push('investorgain');
    expect(() => parseIpoSourcesConfig(raw)).toThrow(/not an official source/);
  });
  it('fetches documents only through an official source, on a listed host', () => {
    const viaAggregator = real();
    (viaAggregator.rhp as { hosts: Record<string, string> }).hosts['nseindia.com'] = 'investorgain';
    expect(() => parseIpoSourcesConfig(viaAggregator)).toThrow(
      /documents come from official sources only/,
    );
    const unlisted = real();
    (unlisted.rhp as { hosts: Record<string, string> }).hosts['example.com'] = 'nse';
    expect(() => parseIpoSourcesConfig(unlisted)).toThrow(/not in documentHosts/);
    expect(() => parseIpoSourcesConfig(withSource({ feeds: ['gmp', 'rhp'] }))).toThrow(
      /never supplies documents/,
    );
  });
  it('takes filings from the regulator only', () => {
    const raw = real();
    const sources = raw.sources as Record<string, Record<string, unknown>>;
    sources.nse = { ...sources.nse, feeds: ['calendar', 'filings'] };
    expect(() => parseIpoSourcesConfig(raw)).toThrow(/regulator only/);
  });
  it('rejects a request interval under one second', () => {
    expect(() => parseIpoSourcesConfig(withSource({ minIntervalMs: 200 }))).toThrow();
  });
});
