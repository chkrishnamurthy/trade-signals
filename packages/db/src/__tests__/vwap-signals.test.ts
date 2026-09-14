import { randomUUID } from 'node:crypto';
import { evaluateVwapSetup } from '@equitywise/core';
import { evidenceSchema, signalQuerySchema } from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strategyFixture } from '../../../core/src/vwap-fixture.js';
import { createDatabase, type DatabaseHandle } from '../client.js';
import { registerStrategy } from '../repositories/signals.js';
import {
  createPaperStudy,
  getSignalSummary,
  getVwapSignal,
  listVwapSignals,
  observeSignalPrice,
  publishVwapSignal,
  reconcileSignalDeadlines,
} from '../repositories/vwap-signals.js';

// Explicit opt-in; never picks up DATABASE_URL or the repository's live .env.
const url = process.env.SIGNALS_TEST_DATABASE_URL;
if (
  url &&
  (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.endsWith('_test'))
)
  throw new Error('Signal integration tests require a local disposable *_test database.');
const suite = url ? describe : describe.skip;
suite('signal persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let owner: number;
  let other: number;
  let instrument: number;
  let version: number;
  let id: number;
  const e = evidenceSchema.parse(evaluateVwapSetup(strategyFixture(), 'BUY').evidence);
  const now = e.confirmationAt + 2000;
  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 6 });
    const suffix = randomUUID();
    const users = await handle.db.execute<{ id: number }>(
      sql`insert into auth_users(email) values (${`signal-${suffix}@test.example`}), (${`other-${suffix}@test.example`}) returning id`,
    );
    owner = users.rows[0]!.id;
    other = users.rows[1]!.id;
    const item = await handle.db.execute<{ id: number }>(
      sql`insert into instruments(symbol,name,kind,exchange,tick_size,provider_id) values (${suffix},'Test research','equity','NSE',5,'test') returning id`,
    );
    instrument = item.rows[0]!.id;
    version = await registerStrategy(handle.db, 'test-vwap', { suffix });
    for (const offset of [-6000, -1000])
      await observeSignalPrice(
        handle.db,
        instrument,
        { at: now + offset, receivedAt: now + offset, price: e.levels.trigger - 5 },
        e.levels.trigger - 10,
        e.levels.trigger,
      );
  });
  afterAll(async () => {
    await handle?.close();
  });
  it('serialises concurrent publication and preserves one active signal', async () => {
    const publish = () =>
      publishVwapSignal(handle.db, {
        instrumentId: instrument,
        strategyVersionId: version,
        symbol: 'TEST',
        companyName: 'Test research',
        sector: 'Test',
        publishedAt: now,
        evidence: e,
      });
    expect((await Promise.all([publish(), publish(), publish()])).filter(Boolean)).toHaveLength(1);
    const rows = await listVwapSignals(
      handle.db,
      owner,
      signalQuerySchema.parse({ pageSize: 100 }),
      now,
    );
    const row = rows.signals.find((s) => s.instrumentId === instrument);
    expect(row).toBeDefined();
    id = row!.id;
    expect((await getVwapSignal(handle.db, id, now)).events).toHaveLength(1);
  });
  it('refuses mutation of published evidence and event history', async () => {
    await expect(
      handle.db.execute(sql`update vwap_signals set symbol='CHANGED' where id=${id}`),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(sql`update vwap_signal_events set reason='CHANGED' where signal_id=${id}`),
    ).rejects.toThrow();
  });
  it('enrols idempotently, isolates users and reserves capital atomically', async () => {
    for (const offset of [-5000, 0])
      await observeSignalPrice(
        handle.db,
        instrument,
        { at: now + offset, receivedAt: now + offset, price: e.levels.trigger - 5 },
        e.levels.trigger - 10,
        e.levels.trigger,
      );
    const request = {
      signalId: id,
      capitalPaise: 10_000_000,
      riskBps: 100,
      moveToBreakeven: false,
      idempotencyKey: randomUUID(),
    };
    const results = await Promise.all([
      createPaperStudy(handle.db, owner, request, now + 100),
      createPaperStudy(handle.db, owner, request, now + 100),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect((await getSignalSummary(handle.db, owner, now + 100)).papers).toHaveLength(1);
    expect((await getSignalSummary(handle.db, other, now + 100)).papers).toHaveLength(0);
    await expect(
      createPaperStudy(handle.db, owner, { ...request, riskBps: 200 }, now + 100),
    ).rejects.toThrow('different inputs');
    await expect(
      createPaperStudy(handle.db, owner, { ...request, idempotencyKey: randomUUID() }, now + 100),
    ).rejects.toThrow('already in your journal');
  });
  it('enforces watchlist ownership even for a guessed valid id', async () => {
    const result = await handle.db.execute<{ id: number }>(
      sql`insert into watchlists(owner_id,name) values (${owner},'Signal private list') returning id`,
    );
    await expect(
      listVwapSignals(
        handle.db,
        other,
        signalQuerySchema.parse({ watchlistId: result.rows[0]!.id }),
        now,
      ),
    ).rejects.toThrow('Watchlist not found');
  });
  it('makes lifecycle retries idempotent and does not enrol after activation', async () => {
    const observation = { at: now + 5000, receivedAt: now + 5000, price: e.levels.trigger };
    await observeSignalPrice(
      handle.db,
      instrument,
      observation,
      e.levels.trigger - 5,
      e.levels.trigger + 5,
    );
    await observeSignalPrice(
      handle.db,
      instrument,
      observation,
      e.levels.trigger - 5,
      e.levels.trigger + 5,
    );
    const detail = await getVwapSignal(handle.db, id, now + 5000);
    expect(detail.signal.projection.state).toBe('ACTIVE');
    expect(detail.events).toHaveLength(2);
    await expect(
      createPaperStudy(
        handle.db,
        other,
        {
          signalId: id,
          capitalPaise: 10_000_000,
          riskBps: 100,
          moveToBreakeven: false,
          idempotencyKey: randomUUID(),
        },
        now + 5100,
      ),
    ).rejects.toThrow('no longer fresh');
  });
  it('enforces two published signals per stock/session across strategy versions', async () => {
    await observeSignalPrice(
      handle.db,
      instrument,
      { at: now + 10_000, receivedAt: now + 10_000, price: e.levels.invalidation },
      e.levels.invalidation - 5,
      e.levels.invalidation + 5,
    );
    const next = { ...e, confirmationAt: e.confirmationAt + 300_000 };
    for (const offset of [294000, 299000])
      await observeSignalPrice(
        handle.db,
        instrument,
        { at: now + offset, receivedAt: now + offset, price: e.levels.trigger - 5 },
        e.levels.trigger - 10,
        e.levels.trigger,
      );

    expect(
      await publishVwapSignal(handle.db, {
        instrumentId: instrument,
        strategyVersionId: version,
        symbol: 'TEST',
        companyName: 'Test',
        sector: 'Test',
        publishedAt: now + 300_000,
        evidence: next,
      }),
    ).toBe(true);
    await observeSignalPrice(
      handle.db,
      instrument,
      { at: now + 310_000, receivedAt: now + 310_000, price: e.levels.invalidation },
      e.levels.invalidation - 5,
      e.levels.invalidation + 5,
    );
    const nextVersion = await registerStrategy(handle.db, 'test-vwap', { revision: randomUUID() });
    for (const offset of [594000, 599000])
      await observeSignalPrice(
        handle.db,
        instrument,
        { at: now + offset, receivedAt: now + offset, price: e.levels.trigger - 5 },
        e.levels.trigger - 10,
        e.levels.trigger,
      );
    const stored = await handle.db.execute<{ ended_at: Date | null }>(
      sql`select ended_at from vwap_signals where instrument_id=${instrument}`,
    );
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows.every((row) => row.ended_at !== null)).toBe(true);
    expect(
      await publishVwapSignal(handle.db, {
        instrumentId: instrument,
        strategyVersionId: nextVersion,
        symbol: 'TEST',
        companyName: 'Test',
        sector: 'Test',
        publishedAt: now + 600_000,
        evidence: { ...e, confirmationAt: e.confirmationAt + 600_000 },
      }),
    ).toBe(false);
  });
  it('filters, sorts and paginates the same persisted snapshot', async () => {
    const query = {
      symbol: 'TEST',
      direction: 'BUY',
      sector: 'Test',
      minimumScore: 90,
      sortBy: 'publishedAt',
      sortDirection: 'asc',
      pageSize: 1,
    };
    const first = await listVwapSignals(handle.db, owner, signalQuerySchema.parse(query), now);
    const second = await listVwapSignals(
      handle.db,
      owner,
      signalQuerySchema.parse({ ...query, page: 2 }),
      now,
    );
    expect(first.total).toBeGreaterThanOrEqual(2);
    expect(first.signals).toHaveLength(1);
    expect(second.signals).toHaveLength(1);
    expect(first.signals[0]!.id).not.toBe(second.signals[0]!.id);
    expect(first.signals[0]!.publishedAt).toBeLessThanOrEqual(second.signals[0]!.publishedAt);
    expect(
      (
        await listVwapSignals(
          handle.db,
          owner,
          signalQuerySchema.parse({ ...query, direction: 'SELL' }),
          now,
        )
      ).total,
    ).toBe(0);
  });
  it('rejects already-observed triggers and enforces a shared capital reservation across signals', async () => {
    const users = await handle.db.execute<{ id: number }>(
      sql`insert into auth_users(email) values (${`budget-${randomUUID()}@test.example`}) returning id`,
    );
    const user = users.rows[0]!.id;
    const ids: number[] = [];
    for (let index = 0; index < 2; index++) {
      const result = await handle.db.execute<{ id: number }>(
        sql`insert into instruments(symbol,name,kind,tick_size,provider_id) values (${randomUUID()},'Budget fixture','equity',5,'test') returning id`,
      );
      const instrumentId = result.rows[0]!.id;
      for (const offset of [-6000, -1000])
        await observeSignalPrice(
          handle.db,
          instrumentId,
          { at: now + offset, receivedAt: now + offset, price: e.levels.trigger - 5 },
          e.levels.trigger - 10,
          e.levels.trigger,
        );
      expect(
        await publishVwapSignal(handle.db, {
          instrumentId,
          strategyVersionId: version,
          symbol: 'BUDGET',
          companyName: 'Budget',
          sector: 'Test',
          publishedAt: now,
          evidence: e,
        }),
      ).toBe(true);
      const rows = await listVwapSignals(
        handle.db,
        user,
        signalQuerySchema.parse({ symbol: 'BUDGET', pageSize: 100 }),
        now,
      );
      ids.push(rows.signals.find((row) => row.instrumentId === instrumentId)!.id);
    }
    const results = await Promise.allSettled(
      ids.map((signalId) =>
        createPaperStudy(
          handle.db,
          user,
          {
            signalId,
            capitalPaise: 150000,
            riskBps: 500,
            moveToBreakeven: false,
            idempotencyKey: randomUUID(),
          },
          now + 100,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const summary = await getSignalSummary(handle.db, user, now + 100);
    expect(
      summary.papers.reduce((sum, p) => sum + p.sizing.capitalRequired, 0),
    ).toBeLessThanOrEqual(150000);
    const result = await handle.db.execute<{ id: number }>(
      sql`insert into instruments(symbol,name,kind,tick_size,provider_id) values (${randomUUID()},'Missed trigger','equity',5,'test') returning id`,
    );
    const instrumentId = result.rows[0]!.id;
    await observeSignalPrice(
      handle.db,
      instrumentId,
      { at: now - 6000, receivedAt: now - 6000, price: e.levels.trigger - 5 },
      e.levels.trigger - 10,
      e.levels.trigger,
    );
    await observeSignalPrice(
      handle.db,
      instrumentId,
      { at: e.confirmationAt, receivedAt: e.confirmationAt, price: e.levels.trigger + 5 },
      e.levels.trigger,
      e.levels.trigger + 10,
    );
    expect(
      await publishVwapSignal(handle.db, {
        instrumentId,
        strategyVersionId: version,
        symbol: 'MISSED',
        companyName: 'Missed',
        sector: 'Test',
        publishedAt: now,
        evidence: e,
      }),
    ).toBe(false);
    await reconcileSignalDeadlines(handle.db, now + 930000);
    expect(
      (await getSignalSummary(handle.db, user, now + 930000)).papers.every(
        (p) => p.projection.endedAt !== null && p.netPaise === null,
      ),
    ).toBe(true);
  });
});
