-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Tables for the
-- single intraday strategy page (docs/planning/intraday-strategy-dhan-plan.md).
--
-- Named strategy_* rather than intraday_*: the removed 2025 engine's
-- `intraday_signals` table (0003) is dropped only by the un-journaled
-- 0019_drop_unsourced_columns.sql, so it may still exist on a host.
--
-- Reuses minute_candles, signal_quotes and signal_observations from 0016.
-- The vwap_* and paper_study* tables stay until their export (plan §10, phase 6).

CREATE TABLE "strategy_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "strategy_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"symbol" text NOT NULL,
	"company_name" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"projection" jsonb NOT NULL,
	"taken" boolean NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"ended_at" timestamp with time zone,
	"realised_net_paise" bigint,
	CONSTRAINT "strategy_signals_evidence_valid" CHECK (jsonb_typeof("strategy_signals"."evidence"->'levels')='object' and ("strategy_signals"."evidence"->'levels'->>'riskDistance')::integer>0 and "strategy_signals"."evidence"->>'direction' in ('BUY','SELL')),
	CONSTRAINT "strategy_signals_ended_terminal" CHECK (("strategy_signals"."ended_at" is null) = ("strategy_signals"."projection"->>'status' not in ('TARGET_2_HIT','STOPPED_OUT','CLOSED_EOD','SKIPPED')))
);
--> statement-breakpoint
CREATE TABLE "strategy_signal_events" (
	"signal_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"status" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"price" integer,
	"shares" integer,
	"resolution" text NOT NULL,
	CONSTRAINT "strategy_signal_events_signal_id_sequence_pk" PRIMARY KEY("signal_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "strategy_session_exclusions" (
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"symbol" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "strategy_session_exclusions_instrument_id_trading_date_pk" PRIMARY KEY("instrument_id","trading_date")
);
--> statement-breakpoint
CREATE TABLE "strategy_scan_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "strategy_scan_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "strategy_signals" ADD CONSTRAINT "strategy_signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_signals" ADD CONSTRAINT "strategy_signals_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_signal_events" ADD CONSTRAINT "strategy_signal_events_signal_id_strategy_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."strategy_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_session_exclusions" ADD CONSTRAINT "strategy_session_exclusions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_signals_one_per_session_idx" ON "strategy_signals" USING btree ("instrument_id","trading_date");--> statement-breakpoint
CREATE INDEX "strategy_signals_date_idx" ON "strategy_signals" USING btree ("trading_date","id");--> statement-breakpoint
-- Events and published evidence are immutable: no UPDATE, ever (the projection column on
-- strategy_signals is the one mutable current-state field and is updated under an advisory lock).
CREATE TRIGGER "strategy_signal_events_no_update" BEFORE UPDATE ON "strategy_signal_events" FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION strategy_signals_freeze_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.instrument_id IS DISTINCT FROM OLD.instrument_id OR NEW.trading_date IS DISTINCT FROM OLD.trading_date THEN
    RAISE EXCEPTION 'strategy_signals evidence is immutable';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "strategy_signals_freeze_evidence" BEFORE UPDATE ON "strategy_signals" FOR EACH ROW EXECUTE FUNCTION strategy_signals_freeze_evidence();
