-- Hand-written. Portfolio: AMFI's half-yearly list of which listed companies are
-- Large, Mid or Small Cap under SEBI's circular of 6 Oct 2017 (large = the top 100
-- by market value, mid = 101-250, small = the rest). Reference data loaded by the
-- worker from AMFI's public file; read by the portfolio's company-size split.

CREATE TABLE "amfi_categories" (
	"isin" text PRIMARY KEY NOT NULL,
	"nse_symbol" text,
	"category" text NOT NULL,
	"period_end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amfi_categories_category_check" CHECK ("amfi_categories"."category" in ('large', 'mid', 'small'))
);
--> statement-breakpoint
CREATE INDEX "amfi_categories_period_idx" ON "amfi_categories" USING btree ("period_end");
