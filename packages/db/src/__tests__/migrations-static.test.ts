import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  alertEvents,
  alerts,
  announcementIngestionRuns,
  eventLog,
  latestQuotes,
} from '../schema/index.js';

/**
 * Database-free checks on the migration files.
 *
 * These do not replace running the migrations (that needs Postgres + TimescaleDB:
 * `pnpm test:integration`), but they catch the mistakes that are cheapest to make
 * by hand — a journal entry with no file, a file with no entry, a migration that
 * drifted from the table definition the code queries.
 */

const DRIZZLE = join(import.meta.dirname, '..', '..', 'drizzle');
const journal = JSON.parse(readFileSync(join(DRIZZLE, 'meta', '_journal.json'), 'utf8')) as {
  entries: { idx: number; when: number; tag: string }[];
};
const sqlFiles = readdirSync(DRIZZLE)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.replace(/\.sql$/, ''));

describe('migration journal', () => {
  it('has a file for every entry and an entry for every file', () => {
    expect(journal.entries.map((e) => e.tag).sort()).toEqual([...sqlFiles].sort());
  });

  it('numbers each entry like its file name, with no duplicates', () => {
    for (const entry of journal.entries) expect(Number(entry.tag.slice(0, 4))).toBe(entry.idx);
    expect(new Set(journal.entries.map((e) => e.idx)).size).toBe(journal.entries.length);
  });

  it('applies in the order the files are numbered, with strictly rising timestamps', () => {
    // drizzle skips a migration whose timestamp is older than one already applied,
    // so an out-of-order `when` silently never runs.
    const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx);
    expect(journal.entries.map((e) => e.idx)).toEqual(ordered.map((e) => e.idx));
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]?.when).toBeGreaterThan(ordered[i - 1]?.when ?? 0);
    }
  });
});

const snake = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Column names declared by `CREATE TABLE "name" ( … )` in a migration file. */
function createdColumns(file: string, table: string): string[] {
  const sql = readFileSync(join(DRIZZLE, `${file}.sql`), 'utf8');
  const match = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  if (match === null) throw new Error(`${file}: no CREATE TABLE "${table}"`);
  return [...(match[1] ?? '').matchAll(/^\t"([a-z0-9_]+)" /gm)].map((m) => m[1] ?? '');
}

function schemaColumns(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => snake(column.name));
}

describe('new tables match their migrations', () => {
  it.each([
    ['alerts', alerts, '0036_alerts'],
    ['alert_events', alertEvents, '0036_alerts'],
    ['latest_quotes', latestQuotes, '0035_latest_quotes'],
  ] as const)('%s', (name, table, file) => {
    expect(getTableConfig(table).name).toBe(name);
    expect([...schemaColumns(table)].sort()).toEqual([...createdColumns(file, name)].sort());
  });

  it('event_log = the original auth_audit columns + the two added in 0038', () => {
    const original = createdColumns('0013_spooky_rumiko_fujikawa', 'auth_audit');
    const added = [
      ...readFileSync(join(DRIZZLE, '0038_event_log.sql'), 'utf8').matchAll(
        /ADD COLUMN "([a-z_]+)"/g,
      ),
    ].map((m) => m[1] ?? '');
    expect(getTableConfig(eventLog).name).toBe('event_log');
    expect([...schemaColumns(eventLog)].sort()).toEqual([...original, ...added].sort());
  });
});

describe('new tables’ indexes and constraints match their migrations', () => {
  const indexNamesIn = (file: string, table: string): string[] =>
    [
      ...readFileSync(join(DRIZZLE, `${file}.sql`), 'utf8').matchAll(
        new RegExp(`CREATE (?:UNIQUE )?INDEX "([a-z0-9_]+)" ON "${table}"`, 'g'),
      ),
    ].map((m) => m[1] ?? '');

  it.each([
    ['alerts', alerts, '0036_alerts'],
    ['alert_events', alertEvents, '0036_alerts'],
    ['latest_quotes', latestQuotes, '0035_latest_quotes'],
    ['event_log', eventLog, '0038_event_log'],
  ] as const)('%s', (name, table, file) => {
    const declared = getTableConfig(table).indexes.map((index) => index.config.name);
    // event_log's two original indexes were only renamed in 0038, so check what 0038 creates.
    const expected =
      name === 'event_log' ? declared.filter((n) => n === 'event_log_category_at_idx') : declared;
    const renamed = name === 'event_log' ? ['event_log_at_idx', 'event_log_user_idx'] : [];
    expect([...indexNamesIn(file, name)].sort()).toEqual([...expected].sort());
    if (name === 'event_log') {
      const sql = readFileSync(join(DRIZZLE, `${file}.sql`), 'utf8');
      for (const n of renamed) expect(sql).toContain(`RENAME TO "${n}"`);
      expect([...declared].sort()).toEqual([...expected, ...renamed].sort());
    }
  });

  it('every constraint a schema check declares exists in the migration', () => {
    for (const [table, file] of [
      [alerts, '0036_alerts'],
      [latestQuotes, '0035_latest_quotes'],
    ] as const) {
      const sql = readFileSync(join(DRIZZLE, `${file}.sql`), 'utf8');
      for (const check of getTableConfig(table).checks) expect(sql).toContain(`"${check.name}"`);
    }
  });
});

describe('0039_announcement_ingestion_error', () => {
  const sql = readFileSync(join(DRIZZLE, '0039_announcement_ingestion_error.sql'), 'utf8');

  it('adds the column the schema declares, and can be applied twice', () => {
    expect(getTableConfig(announcementIngestionRuns).columns.map((c) => c.name)).toContain('error');
    expect(sql).toContain(
      'ALTER TABLE "announcement_ingestion_runs" ADD COLUMN IF NOT EXISTS "error" text',
    );
  });

  it('sorts after every migration that already exists, so a database at 0038 still applies it', () => {
    const entry = journal.entries.find((e) => e.tag === '0039_announcement_ingestion_error');
    const earlier = journal.entries.filter((e) => e.tag < '0039');
    expect(entry).toBeDefined();
    for (const other of earlier) expect(entry?.when).toBeGreaterThan(other.when);
  });
});

describe('0038_event_log renames every object it should', () => {
  const sql = readFileSync(join(DRIZZLE, '0038_event_log.sql'), 'utf8');

  it('renames the table, key, sequence, both indexes and the append-only trigger', () => {
    for (const fragment of [
      'RENAME TO "event_log"',
      'RENAME CONSTRAINT "auth_audit_pkey" TO "event_log_pkey"',
      'ALTER SEQUENCE "auth_audit_id_seq" RENAME TO "event_log_id_seq"',
      'ALTER INDEX "auth_audit_at_idx" RENAME TO "event_log_at_idx"',
      'ALTER INDEX "auth_audit_user_idx" RENAME TO "event_log_user_idx"',
      'ALTER TRIGGER "auth_audit_no_mutation" ON "event_log" RENAME TO "event_log_no_mutation"',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  it('only names objects that the earlier migration actually created', () => {
    const original = readFileSync(join(DRIZZLE, '0013_spooky_rumiko_fujikawa.sql'), 'utf8');
    for (const name of [
      'auth_audit_id_seq',
      'auth_audit_at_idx',
      'auth_audit_user_idx',
      'auth_audit_no_mutation',
    ]) {
      expect(original).toContain(name);
    }
    // The primary key is created inline, so Postgres names it <table>_pkey.
    expect(original).toMatch(/CREATE TABLE "auth_audit" \([\s\S]*?"id" integer PRIMARY KEY/);
  });

  it('uses the trigger-function name the original migration defined', () => {
    expect(sql).toContain('reject_audit_mutation');
  });
});
