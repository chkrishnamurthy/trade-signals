import { deleteExpiredSessions, deleteExpiredTokens, deleteStaleAttempts } from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';

/**
 * Reaps expired auth rows so the tables don't grow without bound: sessions past
 * their absolute expiry, consumed/expired verification & reset tokens, and stale
 * rate-limit counters. Durable state lives in Postgres (not memory), so nothing
 * here is lost on a deploy — this job is what keeps it tidy.
 */

/** Rate-limit rows older than this with no active lock are safe to drop. */
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function authMaintenance(context: WorkerContext, log: Logger): Promise<void> {
  const sessions = await deleteExpiredSessions(context.db);
  const tokens = await deleteExpiredTokens(context.db);
  const attempts = await deleteStaleAttempts(context.db, new Date(Date.now() - ATTEMPT_RETENTION_MS));
  log.info('auth maintenance complete', { sessions, tokens, attempts });
}
