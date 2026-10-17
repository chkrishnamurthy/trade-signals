import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { workerCheckpoints } from '../schema/index.js';

/** Resumable progress for long worker jobs: one cursor row per job name. */
export async function getWorkerCheckpoint(
  db: Database,
  job: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db.select().from(workerCheckpoints).where(eq(workerCheckpoints.job, job));
  return row?.cursor ?? null;
}
/** The checkpoint with its write time — for "how old is this report". */
export async function getWorkerCheckpointRow(
  db: Database,
  job: string,
): Promise<{ cursor: Record<string, unknown>; updatedAt: number } | null> {
  const [row] = await db.select().from(workerCheckpoints).where(eq(workerCheckpoints.job, job));
  return row ? { cursor: row.cursor, updatedAt: row.updatedAt.getTime() } : null;
}
export async function setWorkerCheckpoint(
  db: Database,
  job: string,
  cursor: Record<string, unknown>,
  now: number,
  runId: string | null = null,
) {
  await db
    .insert(workerCheckpoints)
    .values({ job, cursor, runId, updatedAt: new Date(now) })
    .onConflictDoUpdate({
      target: workerCheckpoints.job,
      set: { cursor, runId, updatedAt: new Date(now) },
    });
}
