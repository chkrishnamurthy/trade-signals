-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Stock analysis:
-- docs/planning/screener-dhan-fyers-plan.md §9 — screener, stock page, breadth.
--
-- Reference data, membership, snapshots and breadth are written only by the
-- worker. Snapshot columns are named after the metric catalogue keys
-- (packages/core/src/screener/catalogue.ts). Prices are integer paise; null
-- means "not enough data", never zero. saved_screens is per-user.

CREATE TABLE "instrument_reference" (
	"instrument_id" integer PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"listing_date" date,
	"face_value_paise" integer,
	"industry" text,
	"industry_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_reference_series_known" CHECK ("series" IN ('EQ','BE','BZ'))
);
--> statement-breakpoint
ALTER TABLE "instrument_reference" ADD CONSTRAINT "instrument_reference_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "index_memberships" (
	"index_key" text NOT NULL,
	"instrument_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "index_memberships_index_key_instrument_id_effective_from_pk" PRIMARY KEY("index_key","instrument_id","effective_from"),
	CONSTRAINT "index_memberships_dates_ordered" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
--> statement-breakpoint
ALTER TABLE "index_memberships" ADD CONSTRAINT "index_memberships_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "index_memberships_current_idx" ON "index_memberships" USING btree ("index_key","instrument_id") WHERE "effective_to" IS NULL;
--> statement-breakpoint
CREATE TABLE "screener_snapshot_builds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "screener_snapshot_builds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trading_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"instruments" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"calc_version" text NOT NULL,
	"error" text,
	CONSTRAINT "screener_snapshot_builds_status_known" CHECK ("status" IN ('running','ok','failed'))
);
--> statement-breakpoint
CREATE INDEX "screener_snapshot_builds_date_idx" ON "screener_snapshot_builds" USING btree ("trading_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "screener_snapshots" (
	"trading_date" date NOT NULL,
	"instrument_id" integer NOT NULL,
	"build_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"close" integer NOT NULL,
	"change_pct" double precision,
	"gap_pct" double precision,
	"ret1w" double precision,
	"ret1m" double precision,
	"ret3m" double precision,
	"ret6m" double precision,
	"ret1y" double precision,
	"ret_ytd" double precision,
	"dist52w_high" double precision,
	"dist52w_low" double precision,
	"dist_ath" double precision,
	"range_pos_day" double precision,
	"high52w" integer,
	"low52w" integer,
	"close_vs_ema20" double precision,
	"close_vs_ema50" double precision,
	"close_vs_ema200" double precision,
	"close_vs_sma50" double precision,
	"close_vs_sma200" double precision,
	"ema_stack" text,
	"golden_cross_days" integer,
	"death_cross_days" integer,
	"supertrend_dir" text,
	"supertrend_flip_days" integer,
	"adx14" double precision,
	"plus_di" double precision,
	"minus_di" double precision,
	"higher_highs" boolean,
	"ema20" integer,
	"ema50" integer,
	"ema200" integer,
	"supertrend_value" integer,
	"rsi14" double precision,
	"rsi_above50_days" integer,
	"rsi_above60_days" integer,
	"rsi_below40_days" integer,
	"macd_hist" integer,
	"macd_hist_rising" boolean,
	"macd_cross_up_days" integer,
	"macd_cross_down_days" integer,
	"stoch_k" double precision,
	"stoch_d" double precision,
	"roc20" double precision,
	"atr14" integer,
	"atr_pct" double precision,
	"bb_width" double precision,
	"bb_squeeze" boolean,
	"range10_pct" double precision,
	"range20_pct" double precision,
	"volatility20" double precision,
	"nr4" boolean,
	"nr7" boolean,
	"high20d" integer,
	"low20d" integer,
	"breakout20d" boolean,
	"breakdown20d" boolean,
	"breakout52w" boolean,
	"breakdown52w" boolean,
	"inside_bar" boolean,
	"outside_bar" boolean,
	"bullish_engulfing" boolean,
	"bearish_engulfing" boolean,
	"hammer" boolean,
	"shooting_star" boolean,
	"doji" boolean,
	"rs_rank" double precision,
	"rs1m" double precision,
	"rs3m" double precision,
	"rs6m" double precision,
	"rs_new_high" boolean,
	"volume" bigint NOT NULL,
	"avg_volume20" bigint,
	"rel_volume" double precision,
	"turnover" bigint,
	"avg_turnover20" bigint,
	"trades" integer,
	"delivery_pct" double precision,
	"avg_delivery20" double precision,
	"delivery_vs_avg" double precision,
	"delivery_ratio" double precision,
	"delivery_qty" bigint,
	"fno_eligible" boolean DEFAULT false NOT NULL,
	"fut_oi" bigint,
	"fut_oi_chg_pct" double precision,
	"oi_buildup" text,
	"oi_buildup_streak" integer,
	"oi_as_of" date,
	"promoter_pct" double precision,
	"promoter_chg_qoq" double precision,
	"public_pct" double precision,
	"public_chg_qoq" double precision,
	"promoter_streak" integer,
	"shareholding_as_of" date,
	"bulk_deals20d" integer,
	"block_deals20d" integer,
	"results_in_days" integer,
	"ex_date_in_days" integer,
	"announcements7d" integer,
	"listed_days" integer,
	"industry" text,
	"series" text,
	"index_keys" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"size_bucket" text,
	"signal_direction" text,
	"signal_strength" double precision,
	"spark" integer[],
	"data_issue" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screener_snapshots_trading_date_instrument_id_pk" PRIMARY KEY("trading_date","instrument_id")
);
--> statement-breakpoint
ALTER TABLE "screener_snapshots" ADD CONSTRAINT "screener_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "screener_snapshots" ADD CONSTRAINT "screener_snapshots_build_id_screener_snapshot_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."screener_snapshot_builds"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "screener_snapshots_instrument_idx" ON "screener_snapshots" USING btree ("instrument_id","trading_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "screener_snapshots_date_rs_idx" ON "screener_snapshots" USING btree ("trading_date","rs_rank" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "screener_snapshots_industry_idx" ON "screener_snapshots" USING btree ("trading_date","industry");
--> statement-breakpoint
CREATE TABLE "market_breadth_daily" (
	"universe" text NOT NULL,
	"trading_date" date NOT NULL,
	"advances" integer NOT NULL,
	"declines" integer NOT NULL,
	"unchanged" integer NOT NULL,
	"above20" integer NOT NULL,
	"base20" integer NOT NULL,
	"above50" integer NOT NULL,
	"base50" integer NOT NULL,
	"above200" integer NOT NULL,
	"base200" integer NOT NULL,
	"new_highs" integer NOT NULL,
	"new_lows" integer NOT NULL,
	"base52" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_breadth_daily_universe_trading_date_pk" PRIMARY KEY("universe","trading_date")
);
--> statement-breakpoint
CREATE TABLE "saved_screens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_screens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"columns" jsonb NOT NULL,
	"sort" text NOT NULL,
	"universe" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_screens_name_length" CHECK (char_length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "saved_screens" ADD CONSTRAINT "saved_screens_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_screens_owner_name_idx" ON "saved_screens" USING btree ("owner_id","name");
--> statement-breakpoint
CREATE INDEX "saved_screens_owner_idx" ON "saved_screens" USING btree ("owner_id","updated_at" DESC NULLS LAST);
