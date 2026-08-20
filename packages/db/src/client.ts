import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { readDatabaseEnv } from './env.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: pg.Pool;
  /** Drains the pool. Always call this before a short-lived process exits. */
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /**
   * Defaults to `DATABASE_URL` — the POOLED endpoint.
   *
   * Pass `DATABASE_URL_DIRECT` explicitly for migrations, COPY, or anything
   * else that needs a real session rather than a PgBouncer transaction.
   */
  readonly connectionString?: string;
  /** Max pool size. Keep this modest; Neon's pooler is the real pool. */
  readonly max?: number;
  /**
   * Connection timeout. Generous by default: a suspended Neon compute takes a
   * few seconds to wake, and a tight timeout turns a cold start into an error.
   */
  readonly connectionTimeoutMillis?: number;
  readonly idleTimeoutMillis?: number;
}

/** Opens a connection pool against Neon and wraps it in Drizzle. */
export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseHandle {
  const connectionString = options.connectionString ?? readDatabaseEnv().DATABASE_URL;

  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export interface RetryOptions {
  /** Total attempts, including the first. Default 5. */
  readonly attempts?: number;
  /** Delay before the second attempt; doubles thereafter. Default 500ms. */
  readonly baseDelayMs?: number;
  /** Ceiling on the backoff delay. Default 8000ms. */
  readonly maxDelayMs?: number;
  /** Called before each retry, for logging. */
  readonly onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  /** Injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Retries an operation with exponential backoff and full jitter.
 *
 * Neon computes scale to zero, so the first query after an idle period can fail
 * outright while the compute wakes. Every scheduled job wraps its connection in
 * this before treating a failure as real (CLAUDE.md, "Neon specifics").
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;

      const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delayMs = Math.round(ceiling * (0.5 + Math.random() * 0.5));
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export interface ServerInfo {
  /** Full `version()` banner, e.g. "PostgreSQL 17.5 on aarch64-unknown-linux-gnu...". */
  readonly version: string;
  /** `server_version` GUC, e.g. "17.5". */
  readonly serverVersion: string;
  readonly database: string;
  readonly user: string;
}

/** Round-trips a query to confirm the connection works and report what answered. */
export async function getServerInfo(db: Database): Promise<ServerInfo> {
  const result = await db.execute<{
    version: string;
    server_version: string;
    database: string;
    user: string;
  }>(sql`
    select
      version() as version,
      current_setting('server_version') as server_version,
      current_database() as database,
      current_user as user
  `);

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('getServerInfo: server returned no rows');
  }

  return {
    version: row.version,
    serverVersion: row.server_version,
    database: row.database,
    user: row.user,
  };
}
