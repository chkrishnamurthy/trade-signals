import { randomUUID } from 'node:crypto';
import { evaluateOrb } from '@equitywise/core';
import { type IntradayEvidence, intradayEvidenceSchema } from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import {
  BUY_SIGNAL_AT,
  buySession,
  ist,
  SESSION,
  SESSION_INPUT,
} from '../../../core/src/intraday/fixture.js';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  hasIntradaySignal,
  listIntradaySignals,
  observeIntradayPrice,
  publishIntradaySignal,
  reconcileIntradayDeadlines,
} from '../repositories/intraday.js';
import { registerStrategy } from '../repositories/signals.js';

// One shared, local, disposable *_test database for every DB suite (test/db.ts).
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;
suite('intraday strategy persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let instrument: number;
  let version: number;
  let evidence: IntradayEvidence;
  const publishedAt = BUY_SIGNAL_AT + 2_000;
  const base = () => ({
    instrumentId: instrument,
    strategyVersionId: version,
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    publishedAt,
    evidence,
    skipReason: null,
  });
  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 6 });
    const suffix = randomUUID();
    const item = await handle.db.execute<{ id: number }>(
      sql`insert into instruments(symbol,name,kind,exchange,tick_size,provider_id) values (${suffix},'Test','equity','NSE',5,'test') returning id`,
    );
    instrument = item.rows[0]!.id;
    version = await registerStrategy(handle.db, 'test-orb', { suffix });
    const d = evaluateOrb({
      bars: buySession(),
      asOf: publishedAt,
      tickSize: 5,
      alreadySignalled: false,
      session: SESSION_INPUT,
    });
    if (d.kind !== 'SIGNAL') throw new Error('fixture must signal');
    evidence = intradayEvidenceSchema.parse(d.evidence);
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('publishes once per stock per session, even under concurrent attempts', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => publishIntradaySignal(handle.db, base())),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await hasIntradaySignal(handle.db, instrument, evidence.sessionDate)).toBe(true);
    expect(
      await publishIntradaySignal(handle.db, { ...base(), publishedAt: publishedAt + 60_000 }),
    ).toBeNull();
  });
  it('freezes evidence and events in the database, not only in TypeScript', async () => {
    const [row] = (
      await handle.db.execute<{ id: number }>(
        sql`select id from strategy_signals where instrument_id=${instrument}`,
      )
    ).rows;
    // drizzle wraps the driver error ("Failed query: …"); the trigger's message is the cause.
    const rejects = async (query: Promise<unknown>, pattern: RegExp) => {
      const error = await query.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      const cause = (error as Error & { cause?: unknown }).cause;
      const text = `${(error as Error).message} ${cause instanceof Error ? cause.message : ''}`;
      expect(text).toMatch(pattern);
    };
    await rejects(
      handle.db.execute(
        sql`update strategy_signals set evidence = evidence || '{"vwap":1}' where id=${row!.id}`,
      ),
      /immutable/,
    );
    await rejects(
      handle.db.execute(
        sql`update strategy_signal_events set reason='x' where signal_id=${row!.id}`,
      ),
      /append-only/,
    );
    await rejects(
      handle.db.execute(sql`update strategy_signals set ended_at=now() where id=${row!.id}`),
      /strategy_signals_ended_terminal/,
    );
  });
  it('tracks the levels with one reference share: fill, Target 1, Target 2', async () => {
    const observe = (at: number, price: number) =>
      observeIntradayPrice(handle.db, instrument, { at, receivedAt: at + 500, price }, null, null);
    // Samples must stay within the 15 s coverage window, as the live 5 s cycle does.
    await observe(publishedAt - 4_000, 295_600); // establishes continuity
    await observe(publishedAt + 1_000, 295_650);
    let [s] = await listIntradaySignals(handle.db, evidence.sessionDate);
    // One reference share (LEVEL_TRACKER): the row records which levels were
    // observed; money is per user in the paper tables.
    expect(s?.projection).toMatchObject({
      status: 'ACTIVE',
      shares: 1,
      fill: 295_710,
      taken: true,
    });
    await observe(publishedAt + 1_000, 300_000); // stale: ignored
    await observe(publishedAt + 11_000, 297_830); // Target 1
    await observe(publishedAt + 21_000, 300_020); // Target 2
    [s] = await listIntradaySignals(handle.db, evidence.sessionDate);
    expect(s?.projection.status).toBe('TARGET_2_HIT');
    // 1 share: gross 2999.55 − 2957.10 = ₹42.45, net of estimated charges.
    expect(s?.realisedNetPaise).toBeGreaterThan(0);
    expect(s?.realisedNetPaise).toBeLessThan(4_245);
    expect(s?.initialRiskPaise).toBe(2_260);
    const events = await handle.db.execute<{
      sequence: number;
      status: string;
      shares: number | null;
    }>(
      sql`select sequence,status,shares from strategy_signal_events where signal_id=${s!.id} order by sequence`,
    );
    expect(events.rows.map((r) => [r.sequence, r.status, r.shares])).toEqual([
      [1, 'PENDING', null],
      [2, 'ACTIVE', 1],
      [3, 'TARGET_1_HIT', null],
      [4, 'TARGET_2_HIT', 1],
    ]);
    // Terminal: further prices change nothing.
    await observe(publishedAt + 31_000, 100);
    expect((await listIntradaySignals(handle.db, evidence.sessionDate))[0]?.projection.status).toBe(
      'TARGET_2_HIT',
    );
  });
  it('reconciles a signal left live past the session as unavailable, without a result', async () => {
    const suffix = randomUUID();
    const other = (
      await handle.db.execute<{ id: number }>(
        sql`insert into instruments(symbol,name,kind,exchange,tick_size,provider_id) values (${suffix},'Test','equity','NSE',5,'test') returning id`,
      )
    ).rows[0]!.id;
    const id = await publishIntradaySignal(handle.db, {
      ...base(),
      instrumentId: other,
      symbol: 'OTHER',
    });
    expect(id).not.toBeNull();
    await reconcileIntradayDeadlines(handle.db, ist(SESSION, 15, 30) + 16_000);
    const row = (await listIntradaySignals(handle.db, evidence.sessionDate)).find(
      (r) => r.id === id,
    );
    expect(row?.projection).toMatchObject({
      status: 'SKIPPED',
      resolution: 'UNAVAILABLE',
      fill: null,
      exits: [],
    });
    expect(row?.realisedNetPaise).toBeNull();
  });
});
