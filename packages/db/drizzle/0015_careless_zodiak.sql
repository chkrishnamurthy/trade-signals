CREATE TABLE "bulk_block_deals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bulk_block_deals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"deal_type" text NOT NULL,
	"trading_date" date NOT NULL,
	"instrument_id" integer,
	"symbol" text NOT NULL,
	"company_name" text NOT NULL,
	"client_name" text NOT NULL,
	"side" text NOT NULL,
	"quantity" bigint NOT NULL,
	"price" integer NOT NULL,
	"exchange" text NOT NULL,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporate_announcements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corporate_announcements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"instrument_id" integer,
	"symbol" text NOT NULL,
	"company_name" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"category" text,
	"headline" text NOT NULL,
	"detail" text,
	"attachment_url" text,
	"announced_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fii_dii_flows" (
	"trading_date" date NOT NULL,
	"participant" text NOT NULL,
	"segment" text NOT NULL,
	"buy_value" bigint NOT NULL,
	"sell_value" bigint NOT NULL,
	"net_value" bigint NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fii_dii_flows_trading_date_participant_segment_pk" PRIMARY KEY("trading_date","participant","segment")
);
--> statement-breakpoint
CREATE TABLE "shareholding_patterns" (
	"instrument_id" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"promoter_percent" double precision,
	"fii_percent" double precision,
	"dii_percent" double precision,
	"public_percent" double precision,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shareholding_patterns_instrument_id_as_of_date_pk" PRIMARY KEY("instrument_id","as_of_date")
);
--> statement-breakpoint
ALTER TABLE "bulk_block_deals" ADD CONSTRAINT "bulk_block_deals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_announcements" ADD CONSTRAINT "corporate_announcements_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholding_patterns" ADD CONSTRAINT "shareholding_patterns_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_block_deals_source_key_idx" ON "bulk_block_deals" USING btree ("source","dedupe_key");--> statement-breakpoint
CREATE INDEX "bulk_block_deals_instrument_idx" ON "bulk_block_deals" USING btree ("instrument_id","trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bulk_block_deals_date_idx" ON "bulk_block_deals" USING btree ("trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_announcements_source_ext_idx" ON "corporate_announcements" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "corporate_announcements_instrument_idx" ON "corporate_announcements" USING btree ("instrument_id","announced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "corporate_announcements_announced_idx" ON "corporate_announcements" USING btree ("announced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "corporate_announcements_category_idx" ON "corporate_announcements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "fii_dii_flows_date_idx" ON "fii_dii_flows" USING btree ("trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shareholding_patterns_date_idx" ON "shareholding_patterns" USING btree ("as_of_date" DESC NULLS LAST);