import 'server-only';
import { createDatabase, type Database, type DatabaseHandle } from '@equitywise/db';

/**
 * The web app's database handle.
 *
 * One pool for the process, cached on `globalThis` rather than in a module
 * variable: Next's dev server re-evaluates modules on every edit, and a
 * module-scoped pool would leak a fresh set of connections on each hot reload
 * until Neon refused new ones.
 *
 * Reads only. Everything that writes intraday signals lives in `apps/worker`,
 * which is the only process that may be running the engine — two writers would
 * race on the live-signal unique index and duplicate timeline entries.
 */

const KEY = Symbol.for('signal.web.database');

interface GlobalWithDatabase {
  [KEY]?: DatabaseHandle;
}

export function getDatabase(): Database {
  const store = globalThis as unknown as GlobalWithDatabase;
  const existing = store[KEY];
  if (existing !== undefined) return existing.db;

  const handle = createDatabase({
    // Modest: Neon's pooler is the real pool, and a route handler holds a
    // connection for milliseconds.
    max: 5,
    // Neon drops idle connections; without a handler that is an unhandled
    // `error` event, which in Node kills the process rather than failing a
    // request.
    onIdleError: (error) => {
      console.warn('[db] idle pool connection failed; discarded:', error.message);
    },
  });
  store[KEY] = handle;
  return handle.db;
}

/** True when a database connection string is configured at all. */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return url !== undefined && url !== '';
}
