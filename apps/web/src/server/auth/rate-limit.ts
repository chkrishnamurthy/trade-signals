import 'server-only';
import { clearAttempt, getAttempt, saveAttempt } from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { initialState, isLocked, lockRemainingMs, registerFailure } from './lockout';

/**
 * Durable, Postgres-backed rate limiting. The pure decision logic lives in
 * lockout.ts; this layer reads/writes `auth_attempts` and the clock. Callers key
 * attempts independently by `ip:<addr>` and `email:<addr>`.
 */

export async function checkLock(key: string): Promise<{ locked: boolean; retryAfterSec: number }> {
  const row = await getAttempt(getDatabase(), key);
  if (row === null) return { locked: false, retryAfterSec: 0 };
  const now = new Date();
  if (!isLocked(row, now)) return { locked: false, retryAfterSec: 0 };
  return { locked: true, retryAfterSec: Math.ceil(lockRemainingMs(row, now) / 1000) };
}

export async function recordFailure(key: string): Promise<void> {
  const db = getDatabase();
  const now = new Date();
  const current = (await getAttempt(db, key)) ?? initialState(now);
  await saveAttempt(db, key, registerFailure(current, now));
}

export async function recordSuccess(key: string): Promise<void> {
  await clearAttempt(getDatabase(), key);
}
