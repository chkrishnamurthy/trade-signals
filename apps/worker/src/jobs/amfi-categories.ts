import { latestAmfiPeriod, upsertAmfiCategories } from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { type AmfiSource, createAmfiSource } from '../sources/amfi-categories.js';

/**
 * Loads AMFI's half-yearly Large / Mid / Small Cap list for the portfolio's
 * company-size split. Run weekly: it looks at the listing page and downloads
 * only when a list newer than the one on file has been published (twice a year).
 * On demand: `--once load-amfi-categories`.
 */

/** A list covering fewer companies than this is a broken file, not AMFI's list (it has about 5,400). */
export const MIN_AMFI_ROWS = 500;

/** AMFI's published terms require explicit written approval for product use. */
export function amfiCategoriesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AMFI_CATEGORIES_ENABLED?.trim().toLowerCase() === 'true';
}

export async function loadAmfiCategories(
  context: WorkerContext,
  log: Logger,
  options: { source?: AmfiSource } = {},
): Promise<{ loaded: boolean; periodEnd: string | null; rows: number }> {
  if (options.source === undefined && !amfiCategoriesEnabled()) {
    log.info('AMFI category ingestion is switched off (enable only after data-use approval)');
    return { loaded: false, periodEnd: null, rows: 0 };
  }
  const source = options.source ?? createAmfiSource();
  const file = await source.latestFile();
  if (file === null) {
    log.warn('AMFI listing page links to no list; company size stays as it was');
    return { loaded: false, periodEnd: null, rows: 0 };
  }
  const onFile = await latestAmfiPeriod(context.db);
  if (onFile !== null && onFile >= file.periodEnd) {
    log.info('AMFI list already on file', { periodEnd: onFile });
    return { loaded: false, periodEnd: onFile, rows: 0 };
  }
  const rows = await source.download(file);
  if (rows.length < MIN_AMFI_ROWS) {
    log.warn('AMFI list looks wrong; not loaded', { periodEnd: file.periodEnd, rows: rows.length });
    return { loaded: false, periodEnd: file.periodEnd, rows: rows.length };
  }
  const written = await upsertAmfiCategories(context.db, rows, file.periodEnd);
  log.info('AMFI categories loaded', { periodEnd: file.periodEnd, rows: written });
  return { loaded: true, periodEnd: file.periodEnd, rows: written };
}
