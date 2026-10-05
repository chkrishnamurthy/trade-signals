import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  acknowledgeAlertEvents,
  countUnacknowledgedAlertEvents,
  createAlert,
  deleteAlert,
  getLatestTwoSessions,
  listAlertEvents,
  listAlerts,
  listEnabledAlertsForWorker,
  MAX_ALERTS_PER_USER,
  recordAlertFiring,
  setAlertEnabled,
} from '../repositories/alerts.js';
import { writeAudit } from '../repositories/auth.js';
import { listEvents, logEvent } from '../repositories/event-log.js';
import {
  finishIngestionRun,
  hasAnyIngestionRun,
  hasSuccessfulIngestionRun,
  startIngestionRun,
} from '../repositories/ingestion-runs.js';
import { ensureInstruments, updateInstrumentMetadata } from '../repositories/instruments.js';

/**
 * Alerts, ingestion runs, the event log and the instrument-metadata update, against a
 * real Postgres (the local disposable one — see test/db.ts and docker-compose.test.yml).
 *
 * These are the pieces whose SQL could not be exercised without a database: the
 * per-owner scoping, the "fires once per session" key, the append-only trigger after
 * the 0038 rename, and the raw UPDATE ... FROM (VALUES ...). Every row is tagged so a
 * rerun against a persistent database does not collide, and nothing here asserts that
 * a shared table is globally empty.
 */

const url = resolveTestDatabaseUrl();
const suite = url === undefined ? describe.skip : describe;
const tag = randomUUID().slice(0, 8);
const SETUP_TIMEOUT_MS = 30_000;

/** drizzle wraps the driver's error, so look through the cause chain for the trigger's message. */
async function expectAppendOnly(statement: Promise<unknown>): Promise<void> {
  const error = await statement.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).not.toBeNull();
  let text = '';
  for (let e: unknown = error; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    text += ` ${e.message}`;
  }
  expect(text).toMatch(/append-only/);
}

suite('alerts, ingestion runs, event log, instrument metadata', () => {
  let handle: DatabaseHandle;
  let owner: number;
  let stranger: number;
  let inactiveUser: number;
  let instrumentA: number;
  let instrumentB: number;

  const symbolA = `ALR${tag}A`.toUpperCase();
  const symbolB = `ALR${tag}B`.toUpperCase();

  beforeAll(async () => {
    if (url === undefined) return;
    handle = createDatabase({ connectionString: url, max: 4 });
    const users = await handle.db.execute<{ id: number }>(
      sql`insert into auth_users(email) values
        (${`alerts-owner-${tag}@test.example`}),
        (${`alerts-stranger-${tag}@test.example`}),
        (${`alerts-disabled-${tag}@test.example`}) returning id`,
    );
    owner = users.rows[0]!.id;
    stranger = users.rows[1]!.id;
    inactiveUser = users.rows[2]!.id;
    await handle.db.execute(sql`update auth_users set status='disabled' where id=${inactiveUser}`);

    const ids = await ensureInstruments(handle.db, 'test', [
      { symbol: symbolA, name: 'Alert Test A', kind: 'equity' },
      { symbol: symbolB, name: 'Alert Test B', kind: 'equity' },
    ]);
    instrumentA = ids.get(symbolA)!;
    instrumentB = ids.get(symbolB)!;
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await handle?.close();
  }, SETUP_TIMEOUT_MS);

  const rule = (instrumentId: number, over: Partial<{ oneShot: boolean }> = {}) => ({
    instrumentId,
    metric: 'close',
    comparator: 'crosses_above',
    threshold: 150000,
    oneShot: true,
    ...over,
  });

  describe('alerts', () => {
    it('keeps one owner’s rules out of another’s reach', async () => {
      const created = await createAlert(handle.db, owner, rule(instrumentA));
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      expect((await listAlerts(handle.db, owner)).map((r) => r.id)).toContain(created.id);
      expect(await listAlerts(handle.db, stranger)).toEqual([]);

      // The stranger can neither switch off nor delete it.
      expect(await setAlertEnabled(handle.db, stranger, created.id, false)).toBe(false);
      expect(await deleteAlert(handle.db, stranger, created.id)).toBe(false);
      expect((await listAlerts(handle.db, owner)).find((r) => r.id === created.id)?.enabled).toBe(
        true,
      );

      expect(await setAlertEnabled(handle.db, owner, created.id, false)).toBe(true);
      expect(await deleteAlert(handle.db, owner, created.id)).toBe(true);
    });

    it('refuses a rule the database considers invalid', async () => {
      await expect(
        handle.db.execute(
          sql`insert into alerts(owner_id,instrument_id,metric,comparator,threshold)
              values (${owner},${instrumentA},'volume','crosses_above',1)`,
        ),
      ).rejects.toThrow();
      await expect(
        handle.db.execute(
          sql`insert into alerts(owner_id,instrument_id,metric,comparator,threshold)
              values (${owner},${instrumentA},'close','sideways',1)`,
        ),
      ).rejects.toThrow();
      await expect(
        handle.db.execute(
          sql`insert into alerts(owner_id,instrument_id,metric,comparator,threshold)
              values (${owner},${instrumentA},'close','crosses_above',0)`,
        ),
      ).rejects.toThrow();
    });

    it('stops an owner at the ceiling, even under concurrent creates', async () => {
      const crowded = (
        await handle.db.execute<{ id: number }>(
          sql`insert into auth_users(email) values (${`alerts-crowded-${tag}@test.example`}) returning id`,
        )
      ).rows[0]!.id;

      // Fire MAX + 5 at once: the advisory lock must let exactly MAX through.
      const results = await Promise.all(
        Array.from({ length: MAX_ALERTS_PER_USER + 5 }, () =>
          createAlert(handle.db, crowded, rule(instrumentA)),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(MAX_ALERTS_PER_USER);
      expect(results.filter((r) => !r.ok && r.reason === 'limit_reached')).toHaveLength(5);
      expect(await listAlerts(handle.db, crowded)).toHaveLength(MAX_ALERTS_PER_USER);
    });

    it('fires at most once per rule per session, and a one-shot rule switches itself off', async () => {
      const created = await createAlert(handle.db, owner, rule(instrumentA, { oneShot: true }));
      if (!created.ok) throw new Error('create failed');
      const firing = {
        alertId: created.id,
        ownerId: owner,
        tradingDate: '2026-10-05',
        observedValue: 151000,
        message: 'test',
        oneShot: true,
      };

      const first = await recordAlertFiring(handle.db, firing);
      expect(first).not.toBeNull();
      // The same session again — a re-run — records nothing.
      expect(await recordAlertFiring(handle.db, firing)).toBeNull();

      const stored = (await listAlerts(handle.db, owner)).find((r) => r.id === created.id);
      expect(stored?.enabled).toBe(false);
      expect(stored?.lastTriggeredAt).not.toBeNull();
      expect((await listEnabledAlertsForWorker(handle.db)).map((r) => r.id)).not.toContain(
        created.id,
      );
    });

    it('keeps a repeating rule on, and fires it again on a later session', async () => {
      const created = await createAlert(handle.db, owner, rule(instrumentB, { oneShot: false }));
      if (!created.ok) throw new Error('create failed');
      const base = {
        alertId: created.id,
        ownerId: owner,
        observedValue: 1,
        message: 'again',
        oneShot: false,
      };
      expect(
        await recordAlertFiring(handle.db, { ...base, tradingDate: '2026-10-05' }),
      ).not.toBeNull();
      expect(
        await recordAlertFiring(handle.db, { ...base, tradingDate: '2026-10-06' }),
      ).not.toBeNull();
      expect((await listEnabledAlertsForWorker(handle.db)).map((r) => r.id)).toContain(created.id);
    });

    it('serves events only to their owner, counts unseen ones, and marks them seen', async () => {
      const events = await listAlertEvents(handle.db, owner, 50);
      expect(events.length).toBeGreaterThan(0);
      expect(await listAlertEvents(handle.db, stranger, 50)).toEqual([]);

      expect(await countUnacknowledgedAlertEvents(handle.db, owner)).toBeGreaterThan(0);
      await acknowledgeAlertEvents(handle.db, owner);
      expect(await countUnacknowledgedAlertEvents(handle.db, owner)).toBe(0);
    });

    it('leaves a disabled account’s rules out of the worker’s list', async () => {
      const created = await createAlert(handle.db, inactiveUser, rule(instrumentA));
      if (!created.ok) throw new Error('create failed');
      expect((await listEnabledAlertsForWorker(handle.db)).map((r) => r.id)).not.toContain(
        created.id,
      );
    });

    it('returns the two newest closed sessions on or before a date, newest first', async () => {
      for (const [date, close, rsi] of [
        ['2026-10-01', 100_00, 40],
        ['2026-10-03', 110_00, 55],
        ['2026-10-05', 120_00, 71],
        ['2026-10-07', 130_00, 80],
      ] as const) {
        await handle.db.execute(
          sql`insert into daily_indicators(instrument_id,trading_date,close,volume,high,low,bar_count,rsi14)
              values (${instrumentA},${date},${close},1000,${close},${close},200,${rsi})`,
        );
      }
      const sessions = (await getLatestTwoSessions(handle.db, [instrumentA], '2026-10-06')).get(
        instrumentA,
      );
      expect(sessions?.map((s) => s.tradingDate)).toEqual(['2026-10-05', '2026-10-03']);
      expect(sessions?.[0]).toMatchObject({ closePaise: 120_00, rsi14: 71 });
      expect((await getLatestTwoSessions(handle.db, [], '2026-10-06')).size).toBe(0);
    });
  });

  describe('ingestion runs', () => {
    it('records a run and counts only ok or partial ones as successful', async () => {
      const date = '2031-03-03'; // far from any real session
      expect(await hasSuccessfulIngestionRun(handle.db, ['daily_candles'], date)).toBe(false);

      const failed = await startIngestionRun(handle.db, {
        job: 'daily_candles',
        tradingDate: date,
      });
      await finishIngestionRun(handle.db, failed, {
        status: 'failed',
        instrumentsRequested: 10,
        instrumentsSucceeded: 0,
        rowsWritten: 0,
        failedSymbols: ['A', 'B'],
        error: 'provider down',
      });
      expect(await hasSuccessfulIngestionRun(handle.db, ['daily_candles'], date)).toBe(false);
      expect(await hasAnyIngestionRun(handle.db, ['daily_candles'])).toBe(true);

      const partial = await startIngestionRun(handle.db, {
        job: 'daily_candles',
        tradingDate: date,
      });
      await finishIngestionRun(handle.db, partial, {
        status: 'partial',
        instrumentsRequested: 10,
        instrumentsSucceeded: 8,
        rowsWritten: 80,
        failedSymbols: ['A', 'B'],
      });
      expect(await hasSuccessfulIngestionRun(handle.db, ['daily_candles'], date)).toBe(true);
      // A different job for the same date does not count.
      expect(await hasSuccessfulIngestionRun(handle.db, ['bhavcopy_candles'], date)).toBe(false);
    });
  });

  describe('event log', () => {
    it('stores events with their category and actor, and files old audit calls correctly', async () => {
      await logEvent(handle.db, {
        category: 'worker',
        event: 'job_failed',
        actorType: 'worker',
        detail: { job: `test-${tag}` },
      });
      await writeAudit(handle.db, { event: 'password_changed', userId: owner });
      await writeAudit(handle.db, { event: 'admin_disable_user', userId: owner });
      await writeAudit(handle.db, { event: 'login_success', userId: owner });

      const mine = await listEvents(handle.db, { userId: owner, limit: 10 });
      const byEvent = new Map(mine.map((e) => [e.event, e]));
      expect(byEvent.get('password_changed')).toMatchObject({
        category: 'account',
        actorType: 'user',
      });
      expect(byEvent.get('admin_disable_user')).toMatchObject({ category: 'admin' });
      expect(byEvent.get('login_success')).toMatchObject({ category: 'auth' });

      const workerRows = await listEvents(handle.db, { category: 'worker', limit: 50 });
      expect(workerRows.some((e) => (e.detail as { job?: string })?.job === `test-${tag}`)).toBe(
        true,
      );
    });

    it('paginates newest first with a keyset cursor', async () => {
      const page1 = await listEvents(handle.db, { userId: owner, limit: 2 });
      expect(page1).toHaveLength(2);
      expect(page1[0]!.id).toBeGreaterThan(page1[1]!.id);
      const page2 = await listEvents(handle.db, {
        userId: owner,
        limit: 2,
        beforeId: page1[1]!.id,
      });
      expect(page2.every((e) => e.id < page1[1]!.id)).toBe(true);
    });

    it('is still append-only after the rename: no update, no delete', async () => {
      await expectAppendOnly(
        handle.db.execute(sql`update event_log set event='x' where user_id=${owner}`),
      );
      await expectAppendOnly(handle.db.execute(sql`delete from event_log where user_id=${owner}`));
    });

    it('the old table name is gone', async () => {
      await expect(handle.db.execute(sql`select 1 from auth_audit limit 1`)).rejects.toThrow();
    });
  });

  describe('updateInstrumentMetadata', () => {
    it('replaces placeholders with real values, once, and touches nothing else', async () => {
      const symbol = `MET${tag}`.toUpperCase();
      await ensureInstruments(handle.db, 'test', [{ symbol, name: 'Meta Test', kind: 'equity' }]);
      const before = (
        await handle.db.execute<{
          lot_size: number;
          tick_size: number;
          isin: string | null;
          active: boolean;
        }>(sql`select lot_size,tick_size,isin,active from instruments where symbol=${symbol}`)
      ).rows[0]!;
      expect(before).toMatchObject({ lot_size: 1, tick_size: 5, isin: null, active: true });

      const isin = `INE${tag}1`.toUpperCase();
      const changed = await updateInstrumentMetadata(handle.db, [
        { symbol, lotSize: 1, tickSize: 1, isin },
      ]);
      expect(changed).toBe(1);

      const after = (
        await handle.db.execute<{ tick_size: number; isin: string; active: boolean }>(
          sql`select tick_size,isin,active from instruments where symbol=${symbol}`,
        )
      ).rows[0]!;
      expect(after).toMatchObject({ tick_size: 1, isin, active: true });

      // Unchanged data is not rewritten.
      expect(
        await updateInstrumentMetadata(handle.db, [{ symbol, lotSize: 1, tickSize: 1, isin }]),
      ).toBe(0);
    });

    it('ignores unknown symbols and invalid values, and never overwrites an existing ISIN', async () => {
      const symbol = `MT2${tag}`.toUpperCase();
      const keepIsin = `INE${tag}2`.toUpperCase();
      const otherIsin = `INE${tag}3`.toUpperCase();
      await ensureInstruments(handle.db, 'test', [{ symbol, name: 'Meta Two', kind: 'equity' }]);
      await updateInstrumentMetadata(handle.db, [
        { symbol, lotSize: 1, tickSize: 5, isin: keepIsin },
      ]);

      const changed = await updateInstrumentMetadata(handle.db, [
        { symbol: `NOPE${tag}`, lotSize: 1, tickSize: 5, isin: null },
        { symbol, lotSize: 0, tickSize: 5, isin: null }, // invalid lot
        { symbol, lotSize: 1, tickSize: -3, isin: null }, // invalid tick
        { symbol, lotSize: 1, tickSize: 5, isin: otherIsin }, // would replace the ISIN
      ]);
      expect(changed).toBe(0);
      const row = (
        await handle.db.execute<{ isin: string }>(
          sql`select isin from instruments where symbol=${symbol}`,
        )
      ).rows[0]!;
      expect(row.isin).toBe(keepIsin);
    });
  });
});
