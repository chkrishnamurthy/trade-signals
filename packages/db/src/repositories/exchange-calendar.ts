import type { ExchangeSession } from '@equitywise/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { exchangeSessions } from '../schema/index.js';

/** The stored NSE session for a trading date (`exchange_sessions`). */
export async function upsertExchangeSession(
  db: Database,
  session: ExchangeSession,
  source: string,
  now: number,
) {
  const value = {
    exchange: 'NSE',
    tradingDate: session.tradingDate,
    kind: session.kind,
    openAt: session.openAt === null ? null : new Date(session.openAt),
    closeAt: session.closeAt === null ? null : new Date(session.closeAt),
    entryCutoffAt: session.entryCutoffAt === null ? null : new Date(session.entryCutoffAt),
    squareOffAt: session.squareOffAt === null ? null : new Date(session.squareOffAt),
    source,
    note: session.note,
    updatedAt: new Date(now),
  };
  await db
    .insert(exchangeSessions)
    .values(value)
    .onConflictDoUpdate({
      target: [exchangeSessions.exchange, exchangeSessions.tradingDate],
      set: value,
    });
}
export async function getExchangeSession(
  db: Database,
  tradingDate: string,
): Promise<ExchangeSession | null> {
  const [row] = await db
    .select()
    .from(exchangeSessions)
    .where(
      and(eq(exchangeSessions.exchange, 'NSE'), eq(exchangeSessions.tradingDate, tradingDate)),
    );
  if (!row) return null;
  return {
    tradingDate: row.tradingDate,
    kind: row.kind as ExchangeSession['kind'],
    openAt: row.openAt?.getTime() ?? null,
    closeAt: row.closeAt?.getTime() ?? null,
    entryCutoffAt: row.entryCutoffAt?.getTime() ?? null,
    squareOffAt: row.squareOffAt?.getTime() ?? null,
    note: row.note,
  };
}
