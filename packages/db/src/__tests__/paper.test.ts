import { randomUUID } from 'node:crypto';
import {
  decidePaperEntries,
  emptyPortfolioState,
  evaluateOrb,
  intentFromSignal,
} from '@equitywise/core';
import { intradayEvidenceSchema, type TradeIntent } from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import {
  BUY_SIGNAL_AT,
  buySession,
  ist,
  SESSION,
  SESSION_INPUT,
  SESSION_OPEN,
} from '../../../core/src/intraday/fixture.js';
import { createDatabase, type DatabaseHandle } from '../client.js';
import { observeIntradayPrice, publishIntradaySignal } from '../repositories/intraday.js';
import {
  applyPaperObservation,
  ensurePaperPortfolio,
  getPaperPortfolio,
  listPaperLedger,
  listPaperPositions,
  loadPaperState,
  PaperConflict,
  reconcilePaperLedger,
  recordPaperDecisions,
  updatePaperSettings,
} from '../repositories/paper.js';
import {
  cancelPendingPaperEntry,
  listActivePaperPortfolios,
  listLivePaperTrades,
  listSnapshotPortfolios,
  listUndecidedSignals,
  livePaperInstruments,
  openPaperPositionsMarked,
  paperEquityContext,
  recordPaperSnapshot,
  resolvePaperPositionUnavailable,
} from '../repositories/paper-ops.js';
import { registerStrategy } from '../repositories/signals.js';

const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;
suite('paper trading persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let owner: number;
  let other: number;
  let instrument: number;
  let intent: TradeIntent;
  const publishedAt = BUY_SIGNAL_AT + 2_000;
  const session = {
    tradingDate: '2026-09-17',
    kind: 'NORMAL' as const,
    openAt: SESSION_OPEN,
    closeAt: ist(SESSION, 15, 30),
    entryCutoffAt: ist(SESSION, 14, 30),
    squareOffAt: ist(SESSION, 15, 15),
    note: null,
  };
  const obs = (at: number, price: number) => ({
    at,
    receivedAt: at + 500,
    price,
    continuous: true,
  });

  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 6 });
    const suffix = randomUUID();
    const users = await handle.db.execute<{ id: number }>(
      sql`insert into auth_users(email) values (${`paper-${suffix}@test.example`}), (${`other-${suffix}@test.example`}) returning id`,
    );
    owner = users.rows[0]!.id;
    other = users.rows[1]!.id;
    const item = await handle.db.execute<{ id: number }>(
      sql`insert into instruments(symbol,name,kind,exchange,tick_size,provider_id) values (${suffix},'Test','equity','NSE',5,'test') returning id`,
    );
    instrument = item.rows[0]!.id;
    const version = await registerStrategy(handle.db, 'test-paper', { suffix });
    const d = evaluateOrb({
      bars: buySession(),
      asOf: publishedAt,
      tickSize: 5,
      alreadySignalled: false,
      session: SESSION_INPUT,
    });
    if (d.kind !== 'SIGNAL') throw new Error('fixture must signal');
    const evidence = intradayEvidenceSchema.parse(d.evidence);
    const signalId = await publishIntradaySignal(handle.db, {
      instrumentId: instrument,
      strategyVersionId: version,
      symbol: 'RELIANCE',
      companyName: 'Reliance',
      publishedAt,
      evidence,
      skipReason: null,
    });
    if (signalId === null) throw new Error('signal must publish');
    intent = intentFromSignal({
      id: signalId,
      strategyVersionId: version,
      instrumentId: instrument,
      symbol: 'RELIANCE',
      sector: 'Energy',
      evidence,
    });
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('creates one portfolio per user, OFF, with ₹2,00,000 on the ledger; idempotent; invisible to other users', async () => {
    const a = await ensurePaperPortfolio(handle.db, owner, SESSION_OPEN);
    const b = await ensurePaperPortfolio(handle.db, owner, SESSION_OPEN + 1);
    expect(b.portfolio.id).toBe(a.portfolio.id);
    expect(a.settings).toMatchObject({
      enabled: false,
      enabledAt: null,
      entriesPaused: false,
      riskBps: 100,
      maxOpenPositions: 3,
      settingsVersion: 1,
    });
    expect(a.assignments).toEqual([{ strategyId: 'orb-vc', enabled: true, priority: 10 }]);
    expect(await listPaperLedger(handle.db, owner)).toMatchObject([
      { sequence: 1, kind: 'OPENING_BALANCE', cashAfterPaise: 20_000_000 },
    ]);
    expect(await getPaperPortfolio(handle.db, other)).toBeNull();
    expect(await listPaperLedger(handle.db, other)).toEqual([]);
  });
  it('switching on stamps enabledAt server-side, audits, and refuses a stale version', async () => {
    const on = await updatePaperSettings(
      handle.db,
      owner,
      { enabled: true },
      { expectedVersion: 1, now: SESSION_OPEN + 60_000 },
    );
    expect(on.settings).toMatchObject({
      enabled: true,
      enabledAt: SESSION_OPEN + 60_000,
      settingsVersion: 2,
    });
    await expect(
      updatePaperSettings(
        handle.db,
        owner,
        { riskBps: 50 },
        { expectedVersion: 1, now: SESSION_OPEN + 61_000 },
      ),
    ).rejects.toBeInstanceOf(PaperConflict);
    await expect(
      updatePaperSettings(
        handle.db,
        owner,
        { riskBps: 5000 },
        { expectedVersion: 2, now: SESSION_OPEN + 61_000 },
      ),
    ).rejects.toThrow();
    await expect(
      updatePaperSettings(
        handle.db,
        other,
        { enabled: true },
        { expectedVersion: 1, now: SESSION_OPEN },
      ),
    ).rejects.toMatchObject({ status: 404 });
    const audit = await handle.db.execute<{ event: string }>(
      sql`select event from paper_audit_events where user_id=${owner} order by id`,
    );
    expect(audit.rows.map((r) => r.event)).toEqual(['PORTFOLIO_CREATED', 'PAPER_ENABLED']);
  });
  it('records a decision batch once, reserves cash, and fills/books/closes the worked example on the ledger', async () => {
    const view = await getPaperPortfolio(handle.db, owner);
    const portfolioId = view!.portfolio.id;
    const state = await loadPaperState(
      handle.db,
      portfolioId,
      '2026-09-17',
      () => null,
      20_000_000,
      20_000_000,
    );
    expect(state.cashPaise).toBe(20_000_000);
    const decisions = decidePaperEntries({
      intents: [intent],
      state,
      settings: view!.settings,
      assignments: view!.assignments,
      session,
      asOf: publishedAt,
    });
    expect(decisions[0]).toMatchObject({ accepted: true, shares: 23 });
    const first = await recordPaperDecisions(handle.db, portfolioId, {
      intents: [intent],
      decisions,
      decidedAt: publishedAt,
      settingsVersion: 2,
      squareOffAt: session.squareOffAt,
    });
    const again = await recordPaperDecisions(handle.db, portfolioId, {
      intents: [intent],
      decisions,
      decidedAt: publishedAt,
      settingsVersion: 2,
      squareOffAt: session.squareOffAt,
    });
    expect(first).toEqual({ orders: 1, positions: 1 });
    expect(again).toEqual({ orders: 0, positions: 0 });
    expect((await listPaperLedger(handle.db, owner)).at(-1)).toMatchObject({
      kind: 'RESERVE',
      cashAfterPaise: 13_172_745,
      reservedAfterPaise: 6_827_255,
    });
    // A second decision for the same intent is a duplicate at the state level, too.
    const after = await loadPaperState(
      handle.db,
      portfolioId,
      '2026-09-17',
      () => null,
      20_000_000,
      20_000_000,
    );
    expect(after.decidedKeys.has(`orb-vc:${instrument}:2026-09-17`)).toBe(true);
    expect(after.liveInstruments.has(instrument)).toBe(true);
    expect(after.tradesToday).toBe(1);

    expect(
      await applyPaperObservation(
        handle.db,
        portfolioId,
        instrument,
        obs(publishedAt + 1_000, 295_650),
      ),
    ).toBe(1);
    expect(
      await applyPaperObservation(
        handle.db,
        portfolioId,
        instrument,
        obs(publishedAt + 1_000, 295_650),
      ),
    ).toBe(0); // replayed: no-op
    let [p] = await listPaperPositions(handle.db, owner, { live: true });
    expect(p).toMatchObject({ status: 'OPEN', lockedPaise: 6_801_330, initialRiskPaise: 51_980 });
    expect(p?.projection).toMatchObject({ shares: 23, fill: 295_710 });
    await applyPaperObservation(
      handle.db,
      portfolioId,
      instrument,
      obs(publishedAt + 11_000, 297_830),
    );
    await applyPaperObservation(
      handle.db,
      portfolioId,
      instrument,
      obs(publishedAt + 21_000, 300_020),
    );
    [p] = await listPaperPositions(handle.db, owner, { tradingDate: '2026-09-17' });
    expect(p).toMatchObject({
      status: 'CLOSED',
      exitReason: 'TARGET2',
      grossRealisedPaise: 73_600,
      chargesPaise: 7_285,
      netRealisedPaise: 66_315,
    });
    const ledger = await listPaperLedger(handle.db, owner);
    expect(ledger.map((e) => e.kind)).toEqual([
      'OPENING_BALANCE',
      'RESERVE',
      'RELEASE',
      'ENTRY',
      'EXIT',
      'CHARGES',
      'EXIT',
      'CHARGES',
    ]);
    expect(ledger.at(-1)).toMatchObject({
      cashAfterPaise: 20_066_315,
      reservedAfterPaise: 0,
      lockedAfterPaise: 0,
    });
    expect((await reconcilePaperLedger(handle.db, portfolioId)).mismatches).toEqual([]);
    const order = await handle.db.execute<{ status: string }>(
      sql`select status from paper_orders where portfolio_id=${portfolioId}`,
    );
    expect(order.rows[0]?.status).toBe('FILLED');
    const events = await handle.db.execute<{ sequence: number; kind: string }>(
      sql`select sequence, kind from paper_position_events where position_id=${p!.id} order by sequence`,
    );
    expect(events.rows.map((r) => [r.sequence, r.kind])).toEqual([
      [1, 'OPENED'],
      [2, 'TARGET1_PARTIAL'],
      [3, 'STOP_UPDATED'],
      [4, 'TARGET2'],
    ]);
    expect(await listPaperPositions(handle.db, other)).toEqual([]);
  });
  it('the database refuses ledger edits, backward order states and position identity changes', async () => {
    const view = await getPaperPortfolio(handle.db, owner);
    const id = view!.portfolio.id;
    await expect(
      handle.db.execute(
        sql`update paper_ledger_entries set amount_paise = 0 where portfolio_id=${id}`,
      ),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(sql`update paper_orders set status='PENDING' where portfolio_id=${id}`),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(
        sql`update paper_positions set decided_shares = 1 where portfolio_id=${id}`,
      ),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(
        sql`update paper_positions set status='OPEN', closed_at=null where portfolio_id=${id}`,
      ),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(sql`update paper_audit_events set event='x' where portfolio_id=${id}`),
    ).rejects.toThrow();
  });
  it('emptyPortfolioState matches a fresh portfolio', async () => {
    const fresh = await ensurePaperPortfolio(handle.db, other, SESSION_OPEN);
    const state = await loadPaperState(
      handle.db,
      fresh.portfolio.id,
      '2026-09-17',
      () => null,
      20_000_000,
      20_000_000,
    );
    const expected = emptyPortfolioState(20_000_000);
    expect({
      ...state,
      exposureByInstrument: [...state.exposureByInstrument],
      exposureBySector: [...state.exposureBySector],
      liveInstruments: [...state.liveInstruments],
      decidedKeys: [...state.decidedKeys],
    }).toEqual({
      ...expected,
      exposureByInstrument: [],
      exposureBySector: [],
      liveInstruments: [],
      decidedKeys: [],
    });
  });
  it('worker reads and the two clock-driven closes: undecided intents, cancel, unresolved, snapshots', async () => {
    // A second user, switched on, with the same intent undecided.
    const fresh = await updatePaperSettings(
      handle.db,
      other,
      { enabled: true },
      { expectedVersion: 1, now: SESSION_OPEN + 60_000 },
    );
    const portfolioId = fresh.portfolio.id;
    expect((await listActivePaperPortfolios(handle.db)).map((v) => v.portfolio.id)).toContain(
      portfolioId,
    );
    const undecided = await listUndecidedSignals(handle.db, portfolioId, '2026-09-17');
    expect(undecided.map((u) => u.id)).toEqual([intent.id]);
    const state = await loadPaperState(
      handle.db,
      portfolioId,
      '2026-09-17',
      () => null,
      20_000_000,
      20_000_000,
    );
    const decisions = decidePaperEntries({
      intents: [intent],
      state,
      settings: fresh.settings,
      assignments: fresh.assignments,
      session,
      asOf: publishedAt,
    });
    await recordPaperDecisions(handle.db, portfolioId, {
      intents: [intent],
      decisions,
      decidedAt: publishedAt,
      settingsVersion: fresh.settings.settingsVersion,
      squareOffAt: session.squareOffAt,
    });
    expect(await listUndecidedSignals(handle.db, portfolioId, '2026-09-17')).toEqual([]);
    const live = await listLivePaperTrades(handle.db);
    const mine = live.find((t) => t.portfolioId === portfolioId);
    expect(mine).toMatchObject({ filled: false, validUntil: intent.validUntil });
    expect((await livePaperInstruments(handle.db)).get(instrument)).toContain(portfolioId);

    // Cancel the unfilled entry: reservation released, order CANCELLED, position closed. Idempotent.
    expect(
      await cancelPendingPaperEntry(
        handle.db,
        portfolioId,
        mine!.positionId,
        'ENTRIES_PAUSED',
        'paused',
        publishedAt + 5_000,
      ),
    ).toBe(true);
    expect(
      await cancelPendingPaperEntry(
        handle.db,
        portfolioId,
        mine!.positionId,
        'ENTRIES_PAUSED',
        'paused',
        publishedAt + 6_000,
      ),
    ).toBe(false);
    const ledger = await listPaperLedger(handle.db, other);
    expect(ledger.at(-1)).toMatchObject({
      kind: 'RELEASE',
      cashAfterPaise: 20_000_000,
      reservedAfterPaise: 0,
    });
    const [closed] = await listPaperPositions(handle.db, other, { tradingDate: '2026-09-17' });
    expect(closed).toMatchObject({
      status: 'CLOSED',
      exitReason: 'ENTRIES_PAUSED',
      openedAt: null,
    });
    const order = await handle.db.execute<{ status: string }>(
      sql`select status from paper_orders where portfolio_id=${portfolioId}`,
    );
    expect(order.rows[0]?.status).toBe('CANCELLED');

    // The owner's first trade closed at Target 2 earlier; a snapshot of that book reconciles.
    const ownerId = (await getPaperPortfolio(handle.db, owner))!.portfolio.id;
    expect(await listSnapshotPortfolios(handle.db)).toContain(portfolioId);
    const ctx = await paperEquityContext(handle.db, ownerId, '2026-09-17');
    expect(ctx.peakEquityPaise).toBe(20_066_315);
    const open = await openPaperPositionsMarked(handle.db, ownerId);
    expect(open).toEqual([]);
    await recordPaperSnapshot(handle.db, ownerId, '2026-09-17', ist(SESSION, 15, 35), {
      cashPaise: 20_066_315,
      reservedPaise: 0,
      lockedPaise: 0,
      unrealisedPaise: 0,
      equityPaise: 20_066_315,
      exposurePaise: 0,
      peakEquityPaise: 20_066_315,
      drawdownPaise: 0,
      marksComplete: true,
    });
    await recordPaperSnapshot(handle.db, ownerId, '2026-09-17', ist(SESSION, 15, 35), {
      cashPaise: 1,
      reservedPaise: 0,
      lockedPaise: 0,
      unrealisedPaise: 0,
      equityPaise: 1,
      exposurePaise: 0,
      peakEquityPaise: 1,
      drawdownPaise: 0,
      marksComplete: true,
    }); // same instant: ignored
    const snaps = await handle.db.execute<{ equity_paise: string }>(
      sql`select equity_paise from paper_equity_snapshots where portfolio_id=${ownerId}`,
    );
    expect(snaps.rows.map((r) => Number(r.equity_paise))).toEqual([20_066_315]);

    // An unresolved close for a FILLED trade: a second stock, entered, then the
    // session ends without a covered square-off. Exit at the last sampled
    // price, marked UNAVAILABLE, cost basis released, ledger balanced.
    const suffix2 = randomUUID();
    const item2 = await handle.db.execute<{ id: number }>(
      sql`insert into instruments(symbol,name,kind,exchange,tick_size,provider_id) values (${suffix2},'Test 2','equity','NSE',5,'test') returning id`,
    );
    const instrument2 = item2.rows[0]!.id;
    const signal2 = await publishIntradaySignal(handle.db, {
      instrumentId: instrument2,
      strategyVersionId: intent.strategyVersionId,
      symbol: 'TCS',
      companyName: 'TCS',
      publishedAt,
      evidence: intent.evidence,
      skipReason: null,
    });
    const intent2 = intentFromSignal({
      id: signal2!,
      strategyVersionId: intent.strategyVersionId,
      instrumentId: instrument2,
      symbol: 'TCS',
      sector: 'IT',
      evidence: intent.evidence,
    });
    const view2 = (await getPaperPortfolio(handle.db, other))!;
    const state2 = await loadPaperState(
      handle.db,
      portfolioId,
      '2026-09-17',
      () => null,
      20_000_000,
      20_000_000,
    );
    const d2 = decidePaperEntries({
      intents: [intent2],
      state: state2,
      settings: view2.settings,
      assignments: view2.assignments,
      session,
      asOf: publishedAt,
    });
    expect(d2[0]?.accepted).toBe(true);
    await recordPaperDecisions(handle.db, portfolioId, {
      intents: [intent2],
      decisions: d2,
      decidedAt: publishedAt,
      settingsVersion: view2.settings.settingsVersion,
      squareOffAt: session.squareOffAt,
    });
    // observeIntradayPrice stores the last sampled price the unresolved close will use.
    await observeIntradayPrice(
      handle.db,
      instrument2,
      { at: publishedAt + 1_000, receivedAt: publishedAt + 1_500, price: 295_650 },
      null,
      null,
    );
    expect(
      await applyPaperObservation(
        handle.db,
        portfolioId,
        instrument2,
        obs(publishedAt + 1_000, 295_650),
      ),
    ).toBe(1);
    const [openTrade] = await listPaperPositions(handle.db, other, { live: true });
    expect(openTrade).toMatchObject({ status: 'OPEN', lockedPaise: 6_801_330, symbol: 'TCS' });
    const at = ist(SESSION, 15, 31);
    expect(await resolvePaperPositionUnavailable(handle.db, portfolioId, openTrade!.id, at)).toBe(
      true,
    );
    expect(await resolvePaperPositionUnavailable(handle.db, portfolioId, openTrade!.id, at)).toBe(
      false,
    );
    const [resolved] = await listPaperPositions(handle.db, other, { tradingDate: '2026-09-17' });
    expect(resolved).toMatchObject({
      id: openTrade!.id,
      status: 'CLOSED',
      exitReason: 'COVERAGE_UNAVAILABLE',
      lockedPaise: 0,
    });
    expect(resolved?.projection).toMatchObject({
      resolution: 'UNAVAILABLE',
      remainingShares: 0,
      status: 'CLOSED_EOD',
    });
    // Exit at 2956.50 − slippage vs entry 2957.10: a small loss plus charges; the book still balances.
    expect(resolved!.netRealisedPaise).toBeLessThan(0);
    const last = (await listPaperLedger(handle.db, other)).at(-1);
    expect(last).toMatchObject({ kind: 'CHARGES', lockedAfterPaise: 0, reservedAfterPaise: 0 });
    expect(last!.cashAfterPaise).toBe(20_000_000 + resolved!.netRealisedPaise);
    expect(await listSnapshotPortfolios(handle.db)).toContain(portfolioId);
    expect((await reconcilePaperLedger(handle.db, portfolioId)).mismatches).toEqual([]);
  });
});
