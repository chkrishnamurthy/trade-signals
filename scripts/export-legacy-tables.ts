/**
 * Exports the retired Confirmed-VWAP-Trend-Pullback tables before migration
 * 0024 drops them (docs/planning/paper-trading-plan.md, Phase 6):
 *
 *   vwap_signals, vwap_signal_events, signal_scan_runs,
 *   paper_studies, paper_study_events, paper_equity_marks
 *
 * One JSON-lines file per table under --out (default ./exports/legacy-<date>).
 * Reads only. Run it on the VPS BEFORE merging the branch that carries 0024:
 *
 *   pnpm data:export-legacy --out /var/backups/equitywise/legacy-2026-09-18
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createDatabase } from '@equitywise/db';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';

loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const TABLES = [
  'vwap_signals',
  'vwap_signal_events',
  'signal_scan_runs',
  'paper_studies',
  'paper_study_events',
  'paper_equity_marks',
] as const;

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const out = values.out ?? join('exports', `legacy-${new Date().toISOString().slice(0, 10)}`);

async function main() {
  const handle = createDatabase({});
  mkdirSync(out, { recursive: true });
  try {
    for (const table of TABLES) {
      const exists = await handle.db.execute<{ present: boolean }>(
        sql`select to_regclass(${table}) is not null as present`,
      );
      if (!exists.rows[0]?.present) {
        console.log(`${table}: not present, skipped`);
        continue;
      }
      const rows = await handle.db.execute<Record<string, unknown>>(
        sql.raw(`select * from ${table} order by 1`),
      );
      const file = join(out, `${table}.jsonl`);
      writeFileSync(file, rows.rows.map((r) => JSON.stringify(r)).join('\n'));
      console.log(`${table}: ${rows.rows.length} rows → ${file}`);
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
