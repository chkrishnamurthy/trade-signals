import { Cron } from 'croner';
import { errorFields, type Logger } from './log.js';

/**
 * Job scheduling.
 *
 * Two properties nothing else provides:
 *
 *  - **No overlap.** A run that outlives its interval must not have a second
 *    copy start beside it — two ingestion passes would double-spend a scarce
 *    rate-limit budget and race on the same rows.
 *  - **Visible failure.** An unhandled rejection inside a scheduled callback
 *    would otherwise kill the process silently. Every run is wrapped.
 *
 * All schedules are expressed in IST, because that is when the market opens.
 * `croner` handles the zone; nothing here does offset arithmetic by hand.
 */

export const IST = 'Asia/Kolkata';

export interface JobDefinition {
  readonly name: string;
  /** Standard cron expression, interpreted in IST. */
  readonly schedule: string;
  readonly run: () => Promise<void>;
  /**
   * Skip a run if the previous one is still going.
   *
   * Default true. Set false only for a job that is genuinely idempotent under
   * concurrency, which none of the ingestion jobs are.
   */
  readonly protect?: boolean;
}

export interface Scheduler {
  readonly jobs: readonly Cron[];
  /** Runs a job by name immediately, outside its schedule. */
  trigger(name: string): Promise<void>;
  stop(): void;
  /** Waits for any in-flight run to finish. */
  drain(timeoutMs?: number): Promise<void>;
}

export function createScheduler(definitions: readonly JobDefinition[], log: Logger): Scheduler {
  const running = new Set<string>();
  const byName = new Map<string, JobDefinition>();
  const jobs: Cron[] = [];

  const execute = async (definition: JobDefinition): Promise<void> => {
    if (definition.protect !== false && running.has(definition.name)) {
      log.warn('skipped: previous run still in flight', { job: definition.name });
      return;
    }

    running.add(definition.name);
    const startedAt = Date.now();
    try {
      await definition.run();
      log.info('run complete', { job: definition.name, durationMs: Date.now() - startedAt });
    } catch (error) {
      // Swallowed on purpose: a thrown error here would reject inside croner's
      // timer callback and take the process down, losing every other schedule.
      log.error('run failed', {
        job: definition.name,
        durationMs: Date.now() - startedAt,
        ...errorFields(error),
      });
    } finally {
      running.delete(definition.name);
    }
  };

  for (const definition of definitions) {
    byName.set(definition.name, definition);
    const job = new Cron(
      definition.schedule,
      { name: definition.name, timezone: IST, protect: definition.protect !== false },
      () => execute(definition),
    );
    jobs.push(job);
    log.info('scheduled', {
      job: definition.name,
      schedule: definition.schedule,
      nextRun: job.nextRun()?.toISOString() ?? null,
    });
  }

  return {
    jobs,
    async trigger(name: string): Promise<void> {
      const definition = byName.get(name);
      if (definition === undefined) throw new Error(`Unknown job: ${name}`);
      await execute(definition);
    },
    stop(): void {
      for (const job of jobs) job.stop();
    },
    async drain(timeoutMs = 30_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (running.size > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (running.size > 0) {
        log.warn('drain timed out with runs still in flight', { jobs: [...running] });
      }
    },
  };
}
