import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database, type DatabaseHandle } from '../client.js';
import {
  addWatchlistItems,
  createWatchlist,
  deleteWatchlist,
  getWatchlistLayout,
  getWatchlistMembers,
  listWatchlists,
  listWatchlistViews,
  removeWatchlistItems,
  reorderWatchlistItems,
  reorderWatchlists,
  saveWatchlistLayout,
  saveWatchlistView,
  setDefaultWatchlist,
} from '../repositories/watchlists.js';
import { createTestBranch, type EphemeralBranch, readNeonCredentials } from './neon-branch.js';

/**
 * The watchlist schema, against a real Postgres.
 *
 * Three of the guarantees this feature rests on are enforced by the DATABASE,
 * not by application code, which means they are exactly the ones a unit test
 * cannot check:
 *
 *   - at most one default watchlist, ever
 *   - no duplicate stock within a watchlist
 *   - no two saved views sharing a name in the same scope, INCLUDING the
 *     global scope, where a plain unique index would not have held
 *
 * Each is asserted here by trying to violate it and requiring the write to
 * fail. Runs against a throwaway Neon branch that is migrated from empty and
 * deleted afterwards; skips cleanly when there is no Neon access.
 */

const execFileAsync = promisify(execFile);
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)) });

const credentials = readNeonCredentials();
const suite = credentials === undefined ? describe.skip : describe;

/** Branch creation plus a full migration run is well past the default 5s. */
const SETUP_TIMEOUT_MS = 180_000;

/** Neon computes scale to zero; a first query can take many seconds. */
const TEST_TIMEOUT_MS = 30_000;

suite('watchlist schema', () => {
  let branch: EphemeralBranch;
  let pool: Pool;

  beforeAll(async () => {
    if (credentials === undefined) return;
    branch = await createTestBranch(credentials, { prefix: 'watchlists' });

    const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
    await execFileAsync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL_DIRECT: branch.connectionUri },
    });

    pool = new Pool({ connectionString: branch.connectionUri, max: 2 });
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end();
    await branch?.destroy();
  }, SETUP_TIMEOUT_MS);

  async function freshWatchlist(name: string, isDefault = false): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      'INSERT INTO watchlists (name, is_default) VALUES ($1, $2) RETURNING id',
      [name, isDefault],
    );
    return rows[0]!.id;
  }

  async function freshInstrument(symbol: string): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO instruments (symbol, name, kind, exchange, tick_size, provider_id)
       VALUES ($1, $1, 'equity', 'NSE', 5, 'test') RETURNING id`,
      [symbol],
    );
    return rows[0]!.id;
  }

  it(
    'creates the watchlist tables',
    async () => {
      const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'watchlist%'
       ORDER BY table_name`,
      );
      expect(rows.map((row) => row.table_name)).toEqual([
        'watchlist_items',
        'watchlist_layouts',
        'watchlist_views',
        'watchlists',
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuses a second default watchlist',
    async () => {
      await freshWatchlist('Default one', true);
      await expect(freshWatchlist('Default two', true)).rejects.toMatchObject({ code: '23505' });
      // A non-default one is still fine.
      await expect(freshWatchlist('Not default')).resolves.toEqual(expect.any(Number));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuses the same instrument twice in one watchlist, and allows it across two',
    async () => {
      const [first, second, instrument] = await Promise.all([
        freshWatchlist('Dupes A'),
        freshWatchlist('Dupes B'),
        freshInstrument('DUPETEST'),
      ]);

      const add = (watchlistId: number): Promise<unknown> =>
        pool.query('INSERT INTO watchlist_items (watchlist_id, instrument_id) VALUES ($1, $2)', [
          watchlistId,
          instrument,
        ]);

      await add(first);
      await expect(add(first)).rejects.toMatchObject({ code: '23505' });
      // The same stock on a different list is not a duplicate.
      await expect(add(second)).resolves.toBeDefined();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'cascades items, layout and scoped views when a watchlist is deleted',
    async () => {
      const id = await freshWatchlist('Doomed');
      const instrument = await freshInstrument('CASCADETEST');

      await pool.query(
        'INSERT INTO watchlist_items (watchlist_id, instrument_id) VALUES ($1, $2)',
        [id, instrument],
      );
      await pool.query('INSERT INTO watchlist_layouts (watchlist_id) VALUES ($1)', [id]);
      await pool.query('INSERT INTO watchlist_views (watchlist_id, name) VALUES ($1, $2)', [
        id,
        'Scoped',
      ]);

      await pool.query('DELETE FROM watchlists WHERE id = $1', [id]);

      for (const table of ['watchlist_items', 'watchlist_layouts', 'watchlist_views']) {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${table} WHERE watchlist_id = $1`,
          [id],
        );
        expect(rows[0]?.count, `${table} kept a row`).toBe('0');
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuses two GLOBAL views with the same name',
    async () => {
      const insert = (): Promise<unknown> =>
        pool.query('INSERT INTO watchlist_views (watchlist_id, name) VALUES (NULL, $1)', [
          'Momentum',
        ]);

      await insert();
      // The whole reason `scope_id` is a generated COALESCE(watchlist_id, 0)
      // column: a plain (watchlist_id, name) unique index treats NULLs as
      // distinct and would let this through.
      await expect(insert()).rejects.toMatchObject({ code: '23505' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'allows a scoped view to reuse a global view’s name',
    async () => {
      const id = await freshWatchlist('Scope test');
      await pool.query('INSERT INTO watchlist_views (watchlist_id, name) VALUES (NULL, $1)', [
        'Shared name',
      ]);
      await expect(
        pool.query('INSERT INTO watchlist_views (watchlist_id, name) VALUES ($1, $2)', [
          id,
          'Shared name',
        ]),
      ).resolves.toBeDefined();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'defaults a layout to empty columns, sort and filters',
    async () => {
      const id = await freshWatchlist('Layout defaults');
      await pool.query('INSERT INTO watchlist_layouts (watchlist_id) VALUES ($1)', [id]);

      const { rows } = await pool.query<{
        columns: string[];
        sort: unknown;
        filters: unknown;
        quick_view: string | null;
      }>(
        'SELECT columns, sort, filters, quick_view FROM watchlist_layouts WHERE watchlist_id = $1',
        [id],
      );

      expect(rows[0]?.columns).toEqual([]);
      expect(rows[0]?.sort).toEqual([]);
      expect(rows[0]?.filters).toEqual({});
      expect(rows[0]?.quick_view).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});

/**
 * The watchlist repository against a real database.
 *
 * Everything here is SQL that a mock would not have caught: transactional
 * position assignment, `ON CONFLICT DO NOTHING` returning only the rows it
 * actually inserted, default promotion on delete, and the correlated count that
 * has to keep an empty watchlist in the list.
 */
suite('watchlist repository', () => {
  let branch: EphemeralBranch;
  let handle: DatabaseHandle;
  let db: Database;

  beforeAll(async () => {
    if (credentials === undefined) return;
    branch = await createTestBranch(credentials, { prefix: 'watchlist-repo' });

    const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
    await execFileAsync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL_DIRECT: branch.connectionUri },
    });

    handle = createDatabase({ connectionString: branch.connectionUri, max: 3 });
    db = handle.db;
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await handle?.close();
    await branch?.destroy();
  }, SETUP_TIMEOUT_MS);

  async function instrument(symbol: string): Promise<number> {
    const { rows } = await handle.pool.query<{ id: number }>(
      `INSERT INTO instruments (symbol, name, kind, exchange, tick_size, provider_id)
       VALUES ($1, $1, 'equity', 'NSE', 5, 'test')
       ON CONFLICT (symbol, exchange) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [symbol],
    );
    return rows[0]!.id;
  }

  it(
    'makes the first watchlist the default without being asked',
    async () => {
      const first = await createWatchlist(db, { name: 'First' });
      expect(first.isDefault).toBe(true);

      const second = await createWatchlist(db, { name: 'Second' });
      expect(second.isDefault).toBe(false);
      // Positions increment rather than collide.
      expect(second.position).toBeGreaterThan(first.position);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'moves the default flag rather than ending up with two',
    async () => {
      const lists = await listWatchlists(db);
      const target = lists.find((list) => !list.isDefault);
      expect(target).toBeDefined();

      await setDefaultWatchlist(db, target!.id);
      const after = await listWatchlists(db);
      expect(after.filter((list) => list.isDefault).map((l) => l.id)).toEqual([target!.id]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'counts members exactly, and keeps an empty watchlist in the listing',
    async () => {
      const empty = await createWatchlist(db, { name: 'Empty list' });
      const three = await createWatchlist(db, { name: 'Three stocks' });
      const one = await createWatchlist(db, { name: 'One stock' });

      await addWatchlistItems(db, three.id, [
        await instrument('CNT1'),
        await instrument('CNT2'),
        await instrument('CNT3'),
      ]);
      await addWatchlistItems(db, one.id, [await instrument('CNT4')]);

      const byId = new Map((await listWatchlists(db)).map((list) => [list.id, list.count]));

      // Distinct, non-adjacent counts on purpose. The bug this replaces returned
      // a plausible 1 for EVERY list, which an all-empty or all-single fixture
      // would have agreed with.
      expect(byId.get(three.id)).toBe(3);
      expect(byId.get(one.id)).toBe(1);
      // An empty list must still appear — a LEFT JOIN keeps it, an inner one
      // would drop it from the sidebar and read as the list having been deleted.
      expect(byId.has(empty.id)).toBe(true);
      expect(byId.get(empty.id)).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'reports only the items it actually inserted, so duplicates can be named',
    async () => {
      const list = await createWatchlist(db, { name: 'Adding' });
      const [a, b] = await Promise.all([instrument('AAA'), instrument('BBB')]);

      expect(await addWatchlistItems(db, list.id, [a, b])).toHaveLength(2);
      // Second time round: one already present, one new.
      const c = await instrument('CCC');
      expect(await addWatchlistItems(db, list.id, [a, c])).toEqual([c]);

      const members = await getWatchlistMembers(db, list.id);
      expect(members.map((m) => m.symbol).sort()).toEqual(['AAA', 'BBB', 'CCC']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'assigns increasing positions and honours an explicit reorder',
    async () => {
      const list = await createWatchlist(db, { name: 'Ordering' });
      const ids = [await instrument('ONE'), await instrument('TWO'), await instrument('THREE')];
      await addWatchlistItems(db, list.id, ids);

      expect((await getWatchlistMembers(db, list.id)).map((m) => m.symbol)).toEqual([
        'ONE',
        'TWO',
        'THREE',
      ]);

      await reorderWatchlistItems(db, list.id, [ids[2]!, ids[0]!, ids[1]!]);
      expect((await getWatchlistMembers(db, list.id)).map((m) => m.symbol)).toEqual([
        'THREE',
        'ONE',
        'TWO',
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'removes only the named items',
    async () => {
      const list = await createWatchlist(db, { name: 'Removing' });
      const ids = [await instrument('KEEP'), await instrument('DROP')];
      await addWatchlistItems(db, list.id, ids);

      expect(await removeWatchlistItems(db, list.id, [ids[1]!])).toBe(1);
      expect((await getWatchlistMembers(db, list.id)).map((m) => m.symbol)).toEqual(['KEEP']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'round-trips a layout, overwriting in place',
    async () => {
      const list = await createWatchlist(db, { name: 'Layout' });

      await saveWatchlistLayout(db, list.id, {
        columns: ['ltp', 'rsi14'],
        sort: [{ columnId: 'ltp', direction: 'desc' }],
        filters: { direction: 'advancing' },
        quickView: 'overview',
      });
      expect(await getWatchlistLayout(db, list.id)).toEqual({
        columns: ['ltp', 'rsi14'],
        sort: [{ columnId: 'ltp', direction: 'desc' }],
        filters: { direction: 'advancing' },
        quickView: 'overview',
      });

      // Second save replaces rather than appending a row.
      await saveWatchlistLayout(db, list.id, {
        columns: ['volume'],
        sort: [],
        filters: {},
        quickView: null,
      });
      expect((await getWatchlistLayout(db, list.id))?.columns).toEqual(['volume']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'serves a watchlist its own views plus every global one',
    async () => {
      const mine = await createWatchlist(db, { name: 'Views mine' });
      const other = await createWatchlist(db, { name: 'Views other' });

      await saveWatchlistView(db, {
        watchlistId: mine.id,
        name: 'Scoped',
        columns: ['ltp'],
        sort: [],
        filters: {},
      });
      await saveWatchlistView(db, {
        watchlistId: other.id,
        name: 'Someone else',
        columns: ['ltp'],
        sort: [],
        filters: {},
      });
      await saveWatchlistView(db, {
        watchlistId: null,
        name: 'Everywhere',
        columns: ['volume'],
        sort: [],
        filters: {},
      });

      const names = (await listWatchlistViews(db, mine.id)).map((view) => view.name).sort();
      expect(names).toEqual(['Everywhere', 'Scoped']);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'updates a view in place when the same name is saved again',
    async () => {
      const list = await createWatchlist(db, { name: 'View upsert' });
      await saveWatchlistView(db, {
        watchlistId: list.id,
        name: 'Same',
        columns: ['ltp'],
        sort: [],
        filters: {},
      });
      const second = await saveWatchlistView(db, {
        watchlistId: list.id,
        name: 'Same',
        columns: ['rsi14'],
        sort: [],
        filters: {},
      });

      expect(second.columns).toEqual(['rsi14']);
      expect((await listWatchlistViews(db, list.id)).filter((v) => v.name === 'Same')).toHaveLength(
        1,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'promotes a new default when the default watchlist is deleted',
    async () => {
      const before = await listWatchlists(db);
      const current = before.find((list) => list.isDefault);
      expect(current).toBeDefined();

      await deleteWatchlist(db, current!.id);

      const after = await listWatchlists(db);
      expect(after.some((list) => list.id === current!.id)).toBe(false);
      // Exactly one default survives, and it is the first in the user's order.
      const defaults = after.filter((list) => list.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0]?.id).toBe(after[0]?.id);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'rewrites sidebar order from a complete id list',
    async () => {
      const lists = await listWatchlists(db);
      const reversed = [...lists].reverse().map((list) => list.id);
      await reorderWatchlists(db, reversed);

      expect((await listWatchlists(db)).map((list) => list.id)).toEqual(reversed);
    },
    TEST_TIMEOUT_MS,
  );
});
