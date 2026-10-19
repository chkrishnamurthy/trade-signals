-- Hand-written. Latest provider-neutral quote cache for worker-backed
-- watchlist reads (docs/planning/market-data-scaling-plan.md Phase 2).
--
-- Mutable by design: this is the latest snapshot the worker fetched for the
-- union of watched instruments, not historical price storage.

CREATE TABLE "latest_quotes" (
	"instrument_id" integer PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"source" text NOT NULL,
	"ltp_paise" integer NOT NULL,
	"change_paise" integer,
	"change_percent" double precision,
	"open_paise" integer,
	"high_paise" integer,
	"low_paise" integer,
	"previous_close_paise" integer,
	"average_price_paise" integer,
	"bid_paise" integer,
	"ask_paise" integer,
	"volume" bigint,
	"quote_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "latest_quotes_ltp_positive" CHECK ("ltp_paise" > 0),
	CONSTRAINT "latest_quotes_nullable_prices_positive" CHECK (
		("open_paise" IS NULL OR "open_paise" > 0)
		AND ("high_paise" IS NULL OR "high_paise" > 0)
		AND ("low_paise" IS NULL OR "low_paise" > 0)
		AND ("previous_close_paise" IS NULL OR "previous_close_paise" > 0)
		AND ("average_price_paise" IS NULL OR "average_price_paise" > 0)
		AND ("bid_paise" IS NULL OR "bid_paise" > 0)
		AND ("ask_paise" IS NULL OR "ask_paise" > 0)
	),
	CONSTRAINT "latest_quotes_day_range" CHECK (
		("high_paise" IS NULL OR "low_paise" IS NULL OR "high_paise" >= "low_paise")
		AND ("high_paise" IS NULL OR "open_paise" IS NULL OR "high_paise" >= "open_paise")
		AND ("low_paise" IS NULL OR "open_paise" IS NULL OR "low_paise" <= "open_paise")
	),
	CONSTRAINT "latest_quotes_volume_nonnegative" CHECK ("volume" IS NULL OR "volume" >= 0)
);
--> statement-breakpoint
ALTER TABLE "latest_quotes" ADD CONSTRAINT "latest_quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "latest_quotes_fetched_at_idx" ON "latest_quotes" USING btree ("fetched_at" DESC);
