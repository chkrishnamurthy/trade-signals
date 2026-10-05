import { type Database, logEvent } from '@equitywise/db';
import { errorFields, type Logger } from './log.js';

/**
 * Durable record of worker job failures (docs/planning/logging-plan.md, phase 2).
 *
 * Written once, from the scheduler, so no job has to remember to do it. Only
 * failures are stored — success is noise. A job that fails every minute during an
 * outage would write a row a minute, so repeats of the same job inside the
 * throttle window are dropped (the stdout log still has every one).
 */

/** One stored failure per job per this long. */
export const FAILURE_THROTTLE_MS = 15 * 60_000;

const MAX_MESSAGE = 300;

/**
 * Strips credentials a provider error might echo back, then bounds the length.
 * The log must never hold a token (the plan's guardrail), and an error message is
 * the one free-text field here.
 */
export function redactMessage(message: string): string {
  return (
    message
      // "Bearer <token>" first, so the generic rule below cannot stop at the word "Bearer".
      .replace(/\bbearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
      .replace(
        /(access[_-]?token|authorization|api[_-]?key|secret|password|totp)(["'=:\s]+)(?!\[redacted\])([^\s"'&,;]+)/gi,
        '$1$2[redacted]',
      )
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted-jwt]')
      .slice(0, MAX_MESSAGE)
  );
}

export function createJobFailureRecorder(
  db: Database,
  log: Logger,
  now: () => number = Date.now,
): (job: string, error: unknown, durationMs: number) => Promise<void> {
  const lastStored = new Map<string, number>();

  return async (job, error, durationMs) => {
    const at = now();
    const previous = lastStored.get(job);
    if (previous !== undefined && at - previous < FAILURE_THROTTLE_MS) return;
    lastStored.set(job, at);

    try {
      await logEvent(db, {
        category: 'worker',
        event: 'job_failed',
        actorType: 'worker',
        detail: {
          job,
          durationMs,
          error: redactMessage(error instanceof Error ? error.message : String(error)),
          name: error instanceof Error ? error.name : 'NonError',
        },
      });
    } catch (writeError) {
      // Logging a failure must never become a second failure.
      log.warn('could not store a job failure', { job, ...errorFields(writeError) });
    }
  };
}
