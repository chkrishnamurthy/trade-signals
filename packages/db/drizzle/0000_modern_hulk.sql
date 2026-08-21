CREATE TABLE "alert_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"alert_id" integer NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_value" double precision NOT NULL,
	"message" text NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"kind" text NOT NULL,
	"condition" jsonb NOT NULL,
	"threshold" double precision,
	"enabled" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corporate_actions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corporate_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ex_date" date NOT NULL,
	"ratio" numeric(18, 10) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_candles" (
	"instrument_id" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" integer NOT NULL,
	"high" integer NOT NULL,
	"low" integer NOT NULL,
	"close" integer NOT NULL,
	"volume" bigint NOT NULL,
	"provider_id" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_candles_instrument_id_ts_pk" PRIMARY KEY("instrument_id","ts")
);
--> statement-breakpoint
CREATE TABLE "daily_indicators" (
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"close" integer NOT NULL,
	"volume" bigint NOT NULL,
	"ema20" integer,
	"ema50" integer,
	"ema200" integer,
	"sma20" integer,
	"sma50" integer,
	"rsi14" double precision,
	"macd" integer,
	"macd_signal" integer,
	"macd_histogram" integer,
	"atr14" integer,
	"average_volume" bigint,
	"relative_volume" double precision,
	"high52w" integer,
	"low52w" integer,
	"high" integer NOT NULL,
	"low" integer NOT NULL,
	"change_percent" double precision,
	"bar_count" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_indicators_instrument_id_trading_date_pk" PRIMARY KEY("instrument_id","trading_date")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingestion_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"trading_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"instruments_requested" integer DEFAULT 0 NOT NULL,
	"instruments_succeeded" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"failed_symbols" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instruments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"exchange" text DEFAULT 'NSE' NOT NULL,
	"isin" text,
	"lot_size" integer DEFAULT 1 NOT NULL,
	"tick_size" integer NOT NULL,
	"provider_ref" text,
	"provider_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minute_candles" (
	"instrument_id" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" integer NOT NULL,
	"high" integer NOT NULL,
	"low" integer NOT NULL,
	"close" integer NOT NULL,
	"volume" bigint NOT NULL,
	"provider_id" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minute_candles_instrument_id_ts_pk" PRIMARY KEY("instrument_id","ts")
);
--> statement-breakpoint
CREATE TABLE "signal_factors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_factors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"score" double precision NOT NULL,
	"weight" double precision NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"strategy_version_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"direction" text NOT NULL,
	"strength" integer NOT NULL,
	"bias" double precision NOT NULL,
	"setups" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"close" integer NOT NULL,
	"indicator_snapshot" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "strategy_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"config_hash" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlist_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"watchlist_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_candles" ADD CONSTRAINT "daily_candles_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_indicators" ADD CONSTRAINT "daily_indicators_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_candles" ADD CONSTRAINT "minute_candles_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_factors" ADD CONSTRAINT "signal_factors_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_events_alert_idx" ON "alert_events" USING btree ("alert_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_enabled_idx" ON "alerts" USING btree ("enabled","instrument_id");--> statement-breakpoint
CREATE INDEX "alerts_instrument_idx" ON "alerts" USING btree ("instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_actions_unique_idx" ON "corporate_actions" USING btree ("instrument_id","ex_date","kind");--> statement-breakpoint
CREATE INDEX "corporate_actions_instrument_idx" ON "corporate_actions" USING btree ("instrument_id","ex_date");--> statement-breakpoint
CREATE INDEX "daily_candles_instrument_ts_idx" ON "daily_candles" USING btree ("instrument_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "daily_candles_ts_idx" ON "daily_candles" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "daily_indicators_date_idx" ON "daily_indicators" USING btree ("trading_date");--> statement-breakpoint
CREATE INDEX "daily_indicators_date_rsi_idx" ON "daily_indicators" USING btree ("trading_date","rsi14");--> statement-breakpoint
CREATE INDEX "daily_indicators_date_relvol_idx" ON "daily_indicators" USING btree ("trading_date","relative_volume");--> statement-breakpoint
CREATE INDEX "ingestion_runs_job_date_idx" ON "ingestion_runs" USING btree ("job","trading_date");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_symbol_exchange_idx" ON "instruments" USING btree ("symbol","exchange");--> statement-breakpoint
CREATE INDEX "instruments_active_idx" ON "instruments" USING btree ("active") WHERE "instruments"."active";--> statement-breakpoint
CREATE INDEX "instruments_provider_ref_idx" ON "instruments" USING btree ("provider_id","provider_ref");--> statement-breakpoint
CREATE INDEX "minute_candles_instrument_ts_idx" ON "minute_candles" USING btree ("instrument_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "signal_factors_unique_idx" ON "signal_factors" USING btree ("signal_id","key");--> statement-breakpoint
CREATE INDEX "signal_factors_signal_idx" ON "signal_factors" USING btree ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_unique_idx" ON "signals" USING btree ("instrument_id","trading_date","strategy_version_id");--> statement-breakpoint
CREATE INDEX "signals_date_strength_idx" ON "signals" USING btree ("trading_date","strength" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "signals_date_direction_idx" ON "signals" USING btree ("trading_date","direction");--> statement-breakpoint
CREATE INDEX "signals_instrument_date_idx" ON "signals" USING btree ("instrument_id","trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_versions_hash_idx" ON "strategy_versions" USING btree ("config_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_unique_idx" ON "watchlist_items" USING btree ("watchlist_id","instrument_id");--> statement-breakpoint
CREATE INDEX "watchlist_items_watchlist_idx" ON "watchlist_items" USING btree ("watchlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_name_idx" ON "watchlists" USING btree ("name");