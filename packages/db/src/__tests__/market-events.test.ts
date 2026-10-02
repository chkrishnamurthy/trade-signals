import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  listMarketEvents,
  type MarketEventUpsert,
  upsertMarketEvents,
} from '../repositories/market-events.js';
import { instruments, marketEvents } from '../schema/index.js';

const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

suite('market event persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let watchedInstrumentId: number;
  let otherInstrumentId: number;
  const suffix = randomUUID();
  const sourcePrefix = `test-calendar:${suffix}`;
  const event = (name: string, overrides: Partial<MarketEventUpsert> = {}): MarketEventUpsert => ({
    sourceKey: `${sourcePrefix}:${name}`,
    instrumentId: null,
    symbol: null,
    eventType: 'result',
    eventCategory: null,
    title: `Calendar ${name}`,
    description: null,
    eventDate: '2026-10-10',
    eventTime: null,
    sourceName: 'Test source',
    sourceUrl: null,
    importance: null,
    metadata: {},
    ...overrides,
  });

  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 4 });
    const rows = await handle.db
      .insert(instruments)
      .values([
        {
          symbol: `CAL${suffix.slice(0, 8).toUpperCase()}`,
          name: 'Calendar watched fixture',
          kind: 'equity',
          tickSize: 5,
          providerId: 'test',
        },
        {
          symbol: `OTH${suffix.slice(0, 8).toUpperCase()}`,
          name: 'Calendar other fixture',
          kind: 'equity',
          tickSize: 5,
          providerId: 'test',
        },
      ])
      .returning({ id: instruments.id });
    watchedInstrumentId = rows[0]!.id;
    otherInstrumentId = rows[1]!.id;
  });

  afterAll(async () => {
    if (handle === undefined) return;
    await handle.db
      .delete(marketEvents)
      .where(sql`${marketEvents.sourceKey} like ${`${sourcePrefix}%`}`);
    await handle.db
      .delete(instruments)
      .where(inArray(instruments.id, [watchedInstrumentId, otherInstrumentId]));
    await handle.close();
  });

  it('upserts one stable row and updates its descriptive fields', async () => {
    const first = event('stable', { instrumentId: watchedInstrumentId, symbol: 'WATCHED' });
    await upsertMarketEvents(handle.db, [first]);
    await upsertMarketEvents(handle.db, [{ ...first, title: 'Corrected calendar title' }]);

    const rows = await listMarketEvents(handle.db, {
      from: '2026-10-10',
      to: '2026-10-10',
      eventType: 'result',
      scope: { instrumentIds: [watchedInstrumentId], symbols: [] },
    });
    expect(rows.filter((row) => row.symbol === 'WATCHED')).toHaveLength(1);
    expect(rows.find((row) => row.symbol === 'WATCHED')?.title).toBe('Corrected calendar title');
  });

  it('uses inclusive ranges and explicit instrument or symbol scope', async () => {
    await upsertMarketEvents(handle.db, [
      event('watched', { instrumentId: watchedInstrumentId, symbol: 'WATCHED' }),
      event('other', { instrumentId: otherInstrumentId, symbol: 'OTHER' }),
      event('symbol-only', { eventType: 'dividend', symbol: 'WATCHED-SYMBOL' }),
      event('general', { eventType: 'market_holiday' }),
    ]);

    const byInstrument = await listMarketEvents(handle.db, {
      from: '2026-10-10',
      to: '2026-10-10',
      scope: { instrumentIds: [watchedInstrumentId], symbols: [] },
    });
    expect(byInstrument.every((row) => row.instrumentId === watchedInstrumentId)).toBe(true);

    const bySymbol = await listMarketEvents(handle.db, {
      from: '2026-10-10',
      to: '2026-10-10',
      eventType: 'dividend',
      scope: { instrumentIds: [], symbols: ['WATCHED-SYMBOL'] },
    });
    expect(bySymbol.map((row) => row.symbol)).toEqual(['WATCHED-SYMBOL']);
  });

  it('enforces event type and importance checks at the database boundary', async () => {
    await expect(
      handle.db.execute(sql`
        insert into market_events (source_key, event_type, title, event_date, importance)
        values (${`${sourcePrefix}:invalid`}, 'conference', 'Invalid', '2026-10-10', 'urgent')
      `),
    ).rejects.toThrow();
    const invalid = await handle.db
      .select({ id: marketEvents.id })
      .from(marketEvents)
      .where(eq(marketEvents.sourceKey, `${sourcePrefix}:invalid`));
    expect(invalid).toEqual([]);
  });
});
