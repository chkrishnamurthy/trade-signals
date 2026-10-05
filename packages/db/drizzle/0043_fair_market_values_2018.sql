-- Hand-written. Portfolio phase 4: 31 Jan 2018 highest price per ISIN, for the
-- long-term-gains grandfathering rule. Reference data, loaded once.

CREATE TABLE "fair_market_values_2018" (
	"isin" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"high_paise" integer NOT NULL,
	"close_paise" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fair_market_values_2018_prices_positive" CHECK ("fair_market_values_2018"."high_paise" > 0 and "fair_market_values_2018"."close_paise" > 0)
);
--> statement-breakpoint
CREATE INDEX "fair_market_values_2018_symbol_idx" ON "fair_market_values_2018" USING btree ("symbol");
