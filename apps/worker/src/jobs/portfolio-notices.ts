import {
  DEFAULT_NOTICE_SETTINGS,
  derivePortfolio,
  EVENT_DAYS_AHEAD,
  holdingNotices,
  type PortfolioEntry,
  taxLots,
} from '@equitywise/core';
import {
  insertNotices,
  latestDailyCloses,
  listHoldingEntries,
  listShareChanges,
  type NoticeInsert,
  noticeSettingsFor,
  ownersWithHoldingEntries,
  pruneNotices,
  upcomingHoldingEvents,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';

/**
 * Portfolio phase 6.2: in-app notices about each user's own holdings, after the
 * nightly pass has stored the day's closes. Notices are once-only (a run twice in
 * an evening adds nothing). Logs counts only: never a holding, share count or
 * amount (CLAUDE.md rule 9).
 */

/** Notices are kept this long, then dropped. */
export const NOTICE_KEEP_DAYS = 180;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function writePortfolioNotices(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date } = {},
): Promise<{ owners: number; written: number; failed: number; pruned: number }> {
  const now = options.now ?? new Date();
  const today = istDateKey(now);
  const owners = await ownersWithHoldingEntries(context.db);
  const settings = await noticeSettingsFor(context.db, owners);
  let written = 0;
  let failed = 0;

  for (const ownerId of owners) {
    try {
      const ledger = await listHoldingEntries(context.db, ownerId);
      const entries: PortfolioEntry[] = ledger.map((e) => ({
        id: e.id,
        instrumentId: e.instrumentId,
        kind: e.kind,
        tradeDate: e.tradeDate,
        ...(e.acquiredOn === null ? {} : { acquiredOn: e.acquiredOn }),
        shares: e.shares,
        amountPaise: e.amountPaise,
      }));
      const ids = [...new Set(entries.map((e) => e.instrumentId))];
      // Only actions already in effect (announced ones are on record ahead of their ex-date).
      const changes = await listShareChanges(context.db, ids);
      const derived = derivePortfolio(entries, changes);
      const names = new Map(
        ledger.map((e) => [e.instrumentId, { symbol: e.symbol, name: e.name }]),
      );
      const holdings = derived.holdings.map((h) => ({
        instrumentId: h.instrumentId,
        symbol: names.get(h.instrumentId)?.symbol ?? '',
        name: names.get(h.instrumentId)?.name ?? '',
        shares: h.shares,
      }));
      const heldIds = holdings.map((h) => h.instrumentId);
      if (heldIds.length === 0) continue;
      const [events, latest] = await Promise.all([
        upcomingHoldingEvents(context.db, heldIds, today, addDays(today, EVENT_DAYS_AHEAD)),
        latestDailyCloses(context.db, heldIds),
      ]);
      const closes = new Map(
        [...latest].map(([id, c]) => [
          id,
          {
            closePaise: c.closePaise,
            previousClosePaise: c.previousClosePaise,
            session: istDateKey(c.at),
          },
        ]),
      );
      const notices = holdingNotices({
        today,
        settings: settings.get(ownerId) ?? DEFAULT_NOTICE_SETTINGS,
        holdings,
        events,
        changes,
        closes,
        lots: taxLots(entries, changes, new Map()).open,
      });
      const rows: NoticeInsert[] = notices.map((n) => ({
        ownerId,
        kind: n.kind,
        instrumentId: n.instrumentId,
        dedupeKey: n.dedupeKey,
        noticeDate: n.noticeDate,
        data: { ...n.data },
      }));
      written += await insertNotices(context.db, rows);
    } catch (error) {
      // One owner's data must not stop the rest. The error is counted, not
      // logged with its details, which could carry holding data.
      failed += 1;
      log.warn('portfolio notices failed for one owner', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const pruned = await pruneNotices(
    context.db,
    new Date(now.getTime() - NOTICE_KEEP_DAYS * 86_400_000),
  );
  log.info('portfolio notices written', { owners: owners.length, written, failed, pruned });
  return { owners: owners.length, written, failed, pruned };
}
