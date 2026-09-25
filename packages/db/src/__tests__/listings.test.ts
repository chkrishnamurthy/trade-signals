import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  ensureInstruments,
  getInstrumentBySymbol,
  listActiveInstruments,
  resolveInstrumentIds,
  upsertListings,
} from '../repositories/instruments.js';

/**
 * NSE and BSE listings of one company, against a real Postgres.
 *
 * The multi-exchange guarantee lives in the database: `(symbol, exchange)` is
 * the unique key, so RELIANCE on NSE and RELIANCE on BSE are two rows that
 * never overwrite each other, and every lookup scoped to one exchange never
 * returns the other. Skips when no test database is configured.
 */

const url = resolveTestDatabaseUrl();
const suite = url === undefined ? describe.skip : describe;
// Symbols unique per run, so a persistent local DB never collides.
const tag = randomUUID().slice(0, 6).toUpperCase();
const SYMBOL = `ML${tag}`;
/** Scrip-code-shaped, unique per run. */
const code = (): string => String(100_000 + Math.floor(Math.random() * 899_999));

suite('exchange listings', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 2 });
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('keeps one symbol on two exchanges as two instruments', async () => {
    const nse = await ensureInstruments(
      handle.db,
      'test',
      [{ symbol: SYMBOL, name: 'Test Co', kind: 'equity' }],
      'NSE',
    );
    const bse = await upsertListings(handle.db, 'bse-bhavcopy', [
      {
        symbol: SYMBOL,
        name: 'TEST CO LTD.',
        exchange: 'BSE',
        isin: 'INE000T01019',
        exchangeCode: code(),
        series: 'A',
      },
    ]);

    const nseId = nse.get(SYMBOL);
    const [bseId] = [...bse.values()];
    expect(nseId).toBeDefined();
    expect(bseId).toBeDefined();
    expect(bseId).not.toBe(nseId);

    // Exchange-scoped lookups return only their own listing.
    expect((await resolveInstrumentIds(handle.db, [SYMBOL], 'NSE')).get(SYMBOL)).toBe(nseId);
    expect((await resolveInstrumentIds(handle.db, [SYMBOL], 'BSE')).get(SYMBOL)).toBe(bseId);
    expect((await getInstrumentBySymbol(handle.db, SYMBOL))?.exchange).toBe('NSE');
    expect((await getInstrumentBySymbol(handle.db, SYMBOL, 'BSE'))?.exchange).toBe('BSE');
  });

  it('refreshes a listing’s metadata on a re-run without creating a second row', async () => {
    const scrip = code();
    const first = await upsertListings(handle.db, 'bse-bhavcopy', [
      {
        symbol: `${SYMBOL}B`,
        name: 'TEST TWO',
        exchange: 'BSE',
        isin: 'INE000T02017',
        exchangeCode: scrip,
        series: 'B',
      },
    ]);
    const second = await upsertListings(handle.db, 'bse-bhavcopy', [
      {
        symbol: `${SYMBOL}B`,
        name: 'TEST TWO',
        exchange: 'BSE',
        isin: 'INE000T02017',
        exchangeCode: scrip,
        series: 'T',
      },
    ]);
    expect(second.get(scrip)).toBe(first.get(scrip));
    const row = (await listActiveInstruments(handle.db, 'equity')).find(
      (r) => r.id === second.get(scrip),
    );
    expect(row).toMatchObject({ exchange: 'BSE', series: 'T', isin: 'INE000T02017' });
  });
});
