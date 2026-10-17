import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Resumable progress for long worker jobs (history loads, backfills): one row
 * per job, holding where it got to and whether it finished.
 */
export const workerCheckpoints = pgTable('worker_checkpoints', {
  job: text().primaryKey(),
  cursor: jsonb().$type<Record<string, unknown>>().notNull(),
  runId: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull(),
});
