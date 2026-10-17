-- Hand-written. Removes the intraday ORB-VC strategy, per-user paper trading and the
-- daily signal engine (docs/planning/signals-and-paper-removal-plan.md, Phase 5). No code
-- reads or writes these tables any more.
--
-- ONE-WAY: take a pg_dump of these tables on the VPS before this deploys (the plan has
-- the command). Dropped in dependency order WITHOUT CASCADE, so anything unexpected that
-- still depends on one of them makes this migration fail instead of vanishing with it.
--
-- Kept: minute_candles (price history), exchange_sessions (holiday gating),
-- worker_checkpoints (backfills), daily_indicators, screener_snapshots, and the shared
-- reject_mutation() trigger function, which still guards the candle tables.

-- Paper trading: children before their parents.
DROP TABLE IF EXISTS "paper_position_events";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_fills";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_positions";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_orders";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_ledger_entries";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_equity_snapshots";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_risk_events";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_audit_events";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_strategy_assignments";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_settings";--> statement-breakpoint
DROP TABLE IF EXISTS "paper_portfolios";--> statement-breakpoint
DROP TABLE IF EXISTS "instrument_provider_refs";--> statement-breakpoint

-- The intraday strategy and its quote samples.
DROP TABLE IF EXISTS "strategy_signal_events";--> statement-breakpoint
DROP TABLE IF EXISTS "strategy_session_exclusions";--> statement-breakpoint
DROP TABLE IF EXISTS "strategy_scan_runs";--> statement-breakpoint
DROP TABLE IF EXISTS "strategy_signals";--> statement-breakpoint
DROP TABLE IF EXISTS "signal_observations";--> statement-breakpoint
DROP TABLE IF EXISTS "signal_quotes";--> statement-breakpoint

-- The daily signal engine.
DROP TABLE IF EXISTS "signal_factors";--> statement-breakpoint
DROP TABLE IF EXISTS "signals";--> statement-breakpoint
DROP TABLE IF EXISTS "strategy_versions";--> statement-breakpoint

-- Trigger functions that only these tables used (their triggers went with the tables).
DROP FUNCTION IF EXISTS paper_orders_forward_only();--> statement-breakpoint
DROP FUNCTION IF EXISTS paper_positions_freeze_identity();--> statement-breakpoint
DROP FUNCTION IF EXISTS strategy_signals_freeze_evidence();--> statement-breakpoint
DROP FUNCTION IF EXISTS reject_strategy_mutation();--> statement-breakpoint

-- The screener snapshot's two signal columns (never filled since the signal pass stopped).
ALTER TABLE "screener_snapshots" DROP COLUMN IF EXISTS "signal_direction";--> statement-breakpoint
ALTER TABLE "screener_snapshots" DROP COLUMN IF EXISTS "signal_strength";
