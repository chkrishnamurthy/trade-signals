-- Timescaledb hypertables for the candle tables.
--
-- Hand-written because drizzle-kit does not model hypertables. Idempotent, so
-- re-running against a partially migrated branch is safe.
--
-- NEON CAVEAT: `add_compression_policy` is NOT available on Neon and will fail.
-- Do not add one here (CLAUDE.md). Chunking alone is what keeps scans bounded.

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- `create_hypertable` requires the partitioning column to be part of every
-- unique index. Both tables are keyed (instrument_id, ts), which satisfies it.
--
-- Chunk intervals are sized so a typical query touches one or two chunks:
--   minute_candles  ~187k rows/day at 500 instruments -> 7-day chunks
--   daily_candles   ~500 rows/day                     -> 1-year chunks
SELECT create_hypertable(
  'minute_candles',
  'ts',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);
--> statement-breakpoint

SELECT create_hypertable(
  'daily_candles',
  'ts',
  chunk_time_interval => INTERVAL '365 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);
