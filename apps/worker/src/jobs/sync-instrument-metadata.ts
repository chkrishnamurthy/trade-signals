import { type InstrumentMetadata, updateInstrumentMetadata } from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';

/**
 * Replaces placeholder lot and tick sizes with the provider's real ones.
 *
 * `ensureInstruments` and the NSE equity-list sync create rows before a provider
 * listing exists, with lot 1 and a 5-paise tick. The intraday strategy rounds
 * levels to `tick_size`, so a placeholder on an instrument that really ticks at
 * 1 paisa is a wrong number. This pass only updates those fields on rows that
 * already exist; see `updateInstrumentMetadata`.
 */
export interface MetadataSyncResult {
  readonly listed: number;
  readonly considered: number;
  readonly updated: number;
}

export async function syncInstrumentMetadata(
  context: WorkerContext,
  log: Logger,
): Promise<MetadataSyncResult> {
  const listing = await context.provider.listInstruments();

  // Cash equities only: that is where the placeholders live, and an index has no tick.
  const rows: InstrumentMetadata[] = listing
    .filter((instrument) => instrument.kind === 'equity' && instrument.exchange === 'NSE')
    .map((instrument) => ({
      symbol: instrument.symbol,
      lotSize: instrument.lotSize,
      tickSize: instrument.tickSize,
      isin: instrument.isin,
    }));

  // An empty or tiny listing is a provider fault, not news. Writing from it would
  // only prove it is wrong later, so leave the placeholders alone.
  if (rows.length < 100) {
    log.warn('instrument listing looks truncated; leaving metadata unchanged', {
      listed: listing.length,
      equities: rows.length,
    });
    return { listed: listing.length, considered: rows.length, updated: 0 };
  }

  const updated = await updateInstrumentMetadata(context.db, rows, 'NSE');
  log.info('instrument metadata synced', {
    listed: listing.length,
    considered: rows.length,
    updated,
  });
  return { listed: listing.length, considered: rows.length, updated };
}
