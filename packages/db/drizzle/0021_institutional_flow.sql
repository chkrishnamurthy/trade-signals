-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Tables for the
-- Institutional Flow page (docs/planning/institutional-flow-plan.md §5).
--
-- Money is integer paise; percentages are doubles; trading dates are IST date
-- keys; timestamps are UTC. Every table upserts on its natural key — the
-- exchange republishes a corrected file, so these are not append-only.

CREATE TABLE "feed_ingestion_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feed_ingestion_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"feed" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"fetched" integer NOT NULL,
	"written" integer NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feed_ingestion_runs_feed_idx" ON "feed_ingestion_runs" USING btree ("feed","completed_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "delivery_stats" (
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"traded_qty" bigint NOT NULL,
	"deliverable_qty" bigint NOT NULL,
	"delivery_percent" double precision NOT NULL,
	"close_paise" integer NOT NULL,
	"prev_close_paise" integer NOT NULL,
	"avg_price_paise" integer NOT NULL,
	"turnover_paise" bigint NOT NULL,
	"trades" integer NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_stats_instrument_id_trading_date_pk" PRIMARY KEY("instrument_id","trading_date"),
	CONSTRAINT "delivery_stats_qty_sane" CHECK ("traded_qty" >= 0 AND "deliverable_qty" >= 0 AND "deliverable_qty" <= "traded_qty"),
	CONSTRAINT "delivery_stats_percent_sane" CHECK ("delivery_percent" >= 0 AND "delivery_percent" <= 100),
	CONSTRAINT "delivery_stats_prices_positive" CHECK ("close_paise" > 0 AND "prev_close_paise" > 0 AND "avg_price_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_stats" ADD CONSTRAINT "delivery_stats_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "delivery_stats_date_idx" ON "delivery_stats" USING btree ("trading_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "participant_oi" (
	"trading_date" date NOT NULL,
	"participant" text NOT NULL,
	"bucket" text NOT NULL,
	"long_contracts" bigint NOT NULL,
	"short_contracts" bigint NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_oi_trading_date_participant_bucket_pk" PRIMARY KEY("trading_date","participant","bucket"),
	CONSTRAINT "participant_oi_participant_known" CHECK ("participant" IN ('fii','dii','pro','client')),
	CONSTRAINT "participant_oi_bucket_known" CHECK ("bucket" IN ('index_fut','stock_fut','index_ce','index_pe','stock_ce','stock_pe')),
	CONSTRAINT "participant_oi_contracts_nonnegative" CHECK ("long_contracts" >= 0 AND "short_contracts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "participant_oi_date_idx" ON "participant_oi" USING btree ("trading_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "derivative_oi_daily" (
	"instrument_id" integer NOT NULL,
	"trading_date" date NOT NULL,
	"futures_oi" bigint NOT NULL,
	"oi_change" bigint,
	"near_expiry" date NOT NULL,
	"futures_close_paise" integer NOT NULL,
	"close_change_paise" integer,
	"buildup" text,
	"contracts" integer NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derivative_oi_daily_instrument_id_trading_date_pk" PRIMARY KEY("instrument_id","trading_date"),
	CONSTRAINT "derivative_oi_daily_oi_nonnegative" CHECK ("futures_oi" >= 0 AND "contracts" > 0),
	CONSTRAINT "derivative_oi_daily_close_positive" CHECK ("futures_close_paise" > 0),
	CONSTRAINT "derivative_oi_daily_buildup_known" CHECK ("buildup" IS NULL OR "buildup" IN ('long_buildup','short_buildup','short_covering','long_unwinding'))
);
--> statement-breakpoint
ALTER TABLE "derivative_oi_daily" ADD CONSTRAINT "derivative_oi_daily_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "derivative_oi_daily_date_idx" ON "derivative_oi_daily" USING btree ("trading_date" DESC NULLS LAST);
