-- Hand-written because the drizzle-kit snapshot chain stops at 0017.
-- Public NSE market events are provider-independent; source_key gives the
-- versioned YAML importer a stable, idempotent upsert target.

CREATE TABLE "market_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"source_key" text,
	"instrument_id" integer,
	"symbol" text,
	"event_type" text NOT NULL,
	"event_category" text,
	"title" text NOT NULL,
	"description" text,
	"event_date" date NOT NULL,
	"event_time" timestamp with time zone,
	"source_name" text,
	"source_url" text,
	"importance" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_events_instrument_id_instruments_id_fk"
		FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id"),
	CONSTRAINT "market_events_type_check"
		CHECK ("event_type" in ('market_holiday','result','board_meeting','dividend','bonus','stock_split','rights_issue','buyback','ipo','corporate_announcement')),
	CONSTRAINT "market_events_importance_check"
		CHECK ("importance" is null or "importance" in ('low','medium','high'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "market_events_source_key_idx" ON "market_events" USING btree ("source_key");
--> statement-breakpoint
CREATE INDEX "market_events_date_type_idx" ON "market_events" USING btree ("event_date", "event_type");
--> statement-breakpoint
CREATE INDEX "market_events_instrument_date_idx" ON "market_events" USING btree ("instrument_id", "event_date");
