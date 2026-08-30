CREATE TABLE "backtest_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "backtest_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"label" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"bar_source" text DEFAULT 'stored' NOT NULL,
	"dataset_id" text,
	"git_revision" text NOT NULL,
	"universe" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"universe_dated" boolean DEFAULT false NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"cycle_minutes" integer NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sessions_total" integer DEFAULT 0 NOT NULL,
	"sessions_done" integer DEFAULT 0 NOT NULL,
	"symbols_evaluated" bigint DEFAULT 0 NOT NULL,
	"evaluations" bigint DEFAULT 0 NOT NULL,
	"signals_generated" integer DEFAULT 0 NOT NULL,
	"trades_recorded" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rejections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "backtest_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "backtest_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"setup_key" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"strategy" text NOT NULL,
	"state" text NOT NULL,
	"regime" text NOT NULL,
	"score" integer NOT NULL,
	"quality" text NOT NULL,
	"scoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entry_low" integer NOT NULL,
	"entry_high" integer NOT NULL,
	"invalidation_level" integer NOT NULL,
	"target1" integer NOT NULL,
	"target2" integer NOT NULL,
	"risk_paise" integer NOT NULL,
	"reward_paise" integer NOT NULL,
	"risk_reward" double precision,
	"cost_paise" integer DEFAULT 0 NOT NULL,
	"net_reward_paise" integer DEFAULT 0 NOT NULL,
	"net_risk_paise" integer DEFAULT 0 NOT NULL,
	"net_risk_reward" double precision,
	"reference_price" integer,
	"trigger_minutes" smallint NOT NULL,
	"setup_minutes" smallint NOT NULL,
	"trend_minutes" smallint NOT NULL,
	"indicator_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"triggered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
CREATE TABLE "backtest_trades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "backtest_trades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"signal_id" bigint NOT NULL,
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"kind" text NOT NULL,
	"strategy" text NOT NULL,
	"direction" text NOT NULL,
	"regime" text NOT NULL,
	"score" integer NOT NULL,
	"quality" text NOT NULL,
	"entry_at" timestamp with time zone NOT NULL,
	"entry_price" integer NOT NULL,
	"exit_at" timestamp with time zone NOT NULL,
	"exit_price" integer NOT NULL,
	"exit_reason" text NOT NULL,
	"gross_paise" integer NOT NULL,
	"cost_paise" integer NOT NULL,
	"net_paise" integer NOT NULL,
	"r_multiple" double precision NOT NULL,
	"max_favourable" integer DEFAULT 0 NOT NULL,
	"max_adverse" integer DEFAULT 0 NOT NULL,
	"bars_held" integer DEFAULT 0 NOT NULL,
	"reached_target2" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_signals" ADD CONSTRAINT "backtest_signals_run_id_backtest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."backtest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_signals" ADD CONSTRAINT "backtest_signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_run_id_backtest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."backtest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_signal_id_backtest_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."backtest_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_runs_status_idx" ON "backtest_runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "backtest_runs_queued_idx" ON "backtest_runs" USING btree ("queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "backtest_signals_run_date_idx" ON "backtest_signals" USING btree ("run_id","trading_date");--> statement-breakpoint
CREATE INDEX "backtest_signals_run_score_idx" ON "backtest_signals" USING btree ("run_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "backtest_signals_instrument_idx" ON "backtest_signals" USING btree ("run_id","instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "backtest_trades_signal_idx" ON "backtest_trades" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "backtest_trades_run_idx" ON "backtest_trades" USING btree ("run_id","trading_date");--> statement-breakpoint
CREATE INDEX "backtest_trades_run_score_idx" ON "backtest_trades" USING btree ("run_id","score");