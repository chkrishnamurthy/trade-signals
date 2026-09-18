-- Retired Confirmed-VWAP-Trend-Pullback tables (docs/planning/paper-trading-plan.md, Phase 6).
-- EXPORT FIRST: `pnpm data:export-legacy --out <dir>` on the VPS, before this deploys.
-- `minute_candles`, `signal_quotes` and `signal_observations` stay: the intraday
-- strategy and the paper engine read and write them.
DROP TABLE IF EXISTS "paper_study_events";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_equity_marks";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_studies";--> statement-breakpoint
DROP TABLE IF EXISTS "vwap_signal_events";--> statement-breakpoint
DROP TABLE IF EXISTS "vwap_signals";--> statement-breakpoint
DROP TABLE IF EXISTS "signal_scan_runs";
