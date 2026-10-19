import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('watchlist quote boundary', () => {
  it('keeps polled watchlist details on the DB-backed quote cache', () => {
    const source = readFileSync(fileURLToPath(new URL('./watchlists.ts', import.meta.url)), 'utf8');

    expect(source).not.toContain('provider.fetchQuotes');
    expect(source).not.toContain('.fetchQuotes(');
    expect(source).toContain('latestQuotesForInstruments');
  });
});
