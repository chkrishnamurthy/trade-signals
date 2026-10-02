-- Hand-written (the drizzle-kit snapshot chain stops at 0017). IPOs:
-- docs/planning/ipos-plan.md §6, Phase 1.
--
-- Money is integer paise (bigint); calendar days are IST date keys; instants are
-- UTC timestamptz. Status is never stored: it derives from the dates on read.
-- Subscription and GMP snapshots are append-only history; listing-day prices are
-- written once and frozen; source records change only in `last_seen_at`/`ipo_id`.

CREATE TABLE "ipo_issues" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ipo_issues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"company_name" text NOT NULL,
	"board" text NOT NULL,
	"issue_method" text,
	"designated_exchange" text,
	"exchanges" text[] DEFAULT '{}'::text[] NOT NULL,
	"nse_symbol" text,
	"nse_series" text,
	"bse_scrip_code" text,
	"isin" text,
	"open_date" date,
	"close_date" date,
	"listing_date" date,
	"allotment_date" date,
	"refund_date" date,
	"demat_credit_date" date,
	"upi_cutoff_at" timestamp with time zone,
	"price_band_low_paise" bigint,
	"price_band_high_paise" bigint,
	"issue_price_paise" bigint,
	"face_value_paise" bigint,
	"lot_size" integer,
	"min_bid_quantity" integer,
	"retail_max_paise" bigint,
	"employee_discount_paise" bigint,
	"shares_offered" bigint,
	"fresh_issue_shares" bigint,
	"fresh_issue_paise" bigint,
	"ofs_shares" bigint,
	"ofs_paise" bigint,
	"market_maker_shares" bigint,
	"anchor_shares" bigint,
	"issue_size_text" text,
	"registrar_name" text,
	"registrar_contact" text,
	"lead_managers" text[] DEFAULT '{}'::text[] NOT NULL,
	"sponsor_banks" text[] DEFAULT '{}'::text[] NOT NULL,
	"market_maker" text,
	"lifecycle_override" text,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ipo_issues_board_known" CHECK ("board" IN ('mainboard','sme')),
	CONSTRAINT "ipo_issues_method_known" CHECK ("issue_method" IS NULL OR "issue_method" IN ('book_building','fixed_price')),
	CONSTRAINT "ipo_issues_exchange_known" CHECK ("designated_exchange" IS NULL OR "designated_exchange" IN ('NSE','BSE')),
	CONSTRAINT "ipo_issues_override_known" CHECK ("lifecycle_override" IS NULL OR "lifecycle_override" IN ('withdrawn','postponed')),
	CONSTRAINT "ipo_issues_band_sane" CHECK (("price_band_low_paise" IS NULL OR "price_band_low_paise" > 0) AND ("price_band_high_paise" IS NULL OR "price_band_high_paise" > 0) AND ("price_band_low_paise" IS NULL OR "price_band_high_paise" IS NULL OR "price_band_low_paise" <= "price_band_high_paise")),
	CONSTRAINT "ipo_issues_prices_positive" CHECK (("issue_price_paise" IS NULL OR "issue_price_paise" > 0) AND ("face_value_paise" IS NULL OR "face_value_paise" > 0)),
	CONSTRAINT "ipo_issues_quantities_positive" CHECK (("lot_size" IS NULL OR "lot_size" > 0) AND ("min_bid_quantity" IS NULL OR "min_bid_quantity" > 0)),
	CONSTRAINT "ipo_issues_dates_ordered" CHECK (("open_date" IS NULL OR "close_date" IS NULL OR "close_date" >= "open_date") AND ("close_date" IS NULL OR "listing_date" IS NULL OR "listing_date" >= "close_date"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_issues_slug_idx" ON "ipo_issues" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_issues_nse_symbol_open_idx" ON "ipo_issues" USING btree ("nse_symbol","open_date") WHERE "nse_symbol" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_issues_isin_idx" ON "ipo_issues" USING btree ("isin") WHERE "isin" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_issues_bse_code_idx" ON "ipo_issues" USING btree ("bse_scrip_code") WHERE "bse_scrip_code" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ipo_issues_open_idx" ON "ipo_issues" USING btree ("open_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "ipo_issues_close_idx" ON "ipo_issues" USING btree ("close_date");
--> statement-breakpoint
CREATE INDEX "ipo_issues_listing_idx" ON "ipo_issues" USING btree ("listing_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "ipo_issues_board_idx" ON "ipo_issues" USING btree ("board");
--> statement-breakpoint
CREATE TABLE "ipo_source_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ipo_source_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ipo_id" bigint,
	"source" text NOT NULL,
	"feed" text NOT NULL,
	"external_key" text NOT NULL,
	"source_url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ipo_source_records" ADD CONSTRAINT "ipo_source_records_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_source_records_version_idx" ON "ipo_source_records" USING btree ("source","feed","external_key","payload_hash");
--> statement-breakpoint
CREATE INDEX "ipo_source_records_ipo_idx" ON "ipo_source_records" USING btree ("ipo_id");
--> statement-breakpoint
CREATE INDEX "ipo_source_records_feed_idx" ON "ipo_source_records" USING btree ("source","feed","last_seen_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "ipo_subscription_snapshots" (
	"ipo_id" bigint NOT NULL,
	"source" text NOT NULL,
	"scope" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"as_of_basis" text NOT NULL,
	"category" text NOT NULL,
	"category_label" text NOT NULL,
	"shares_offered" bigint,
	"shares_bid" bigint,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ipo_subscription_snapshots_pk" PRIMARY KEY("ipo_id","source","scope","as_of","category_label"),
	CONSTRAINT "ipo_subscription_scope_known" CHECK ("scope" IN ('nse','bse','consolidated')),
	CONSTRAINT "ipo_subscription_basis_known" CHECK ("as_of_basis" IN ('stated','fetched')),
	CONSTRAINT "ipo_subscription_category_known" CHECK ("category" IN ('qib','nii','nii_big','nii_small','retail','employee','shareholder','policyholder','other','total')),
	CONSTRAINT "ipo_subscription_counts_nonnegative" CHECK (("shares_offered" IS NULL OR "shares_offered" >= 0) AND ("shares_bid" IS NULL OR "shares_bid" >= 0))
);
--> statement-breakpoint
ALTER TABLE "ipo_subscription_snapshots" ADD CONSTRAINT "ipo_subscription_snapshots_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ipo_subscription_snapshots_latest_idx" ON "ipo_subscription_snapshots" USING btree ("ipo_id","scope","as_of" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "ipo_documents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ipo_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ipo_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sha256" text,
	"size_bytes" bigint,
	CONSTRAINT "ipo_documents_kind_known" CHECK ("kind" IN ('drhp','rhp','prospectus','addendum','basis_of_allotment','anchor_allocation','price_band_ad'))
);
--> statement-breakpoint
ALTER TABLE "ipo_documents" ADD CONSTRAINT "ipo_documents_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ipo_documents_url_idx" ON "ipo_documents" USING btree ("ipo_id","url");
--> statement-breakpoint
CREATE TABLE "ipo_listing_performance" (
	"ipo_id" bigint NOT NULL,
	"exchange" text NOT NULL,
	"listing_date" date NOT NULL,
	"issue_price_paise" bigint NOT NULL,
	"listing_open_paise" bigint NOT NULL,
	"listing_high_paise" bigint NOT NULL,
	"listing_low_paise" bigint NOT NULL,
	"listing_close_paise" bigint NOT NULL,
	"listing_volume" bigint NOT NULL,
	"latest_close_paise" bigint,
	"latest_close_date" date,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ipo_listing_performance_pk" PRIMARY KEY("ipo_id","exchange"),
	CONSTRAINT "ipo_listing_exchange_known" CHECK ("exchange" IN ('NSE','BSE')),
	CONSTRAINT "ipo_listing_prices_positive" CHECK ("issue_price_paise" > 0 AND "listing_open_paise" > 0 AND "listing_high_paise" > 0 AND "listing_low_paise" > 0 AND "listing_close_paise" > 0 AND "listing_high_paise" >= "listing_low_paise")
);
--> statement-breakpoint
ALTER TABLE "ipo_listing_performance" ADD CONSTRAINT "ipo_listing_performance_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ipo_listing_performance_date_idx" ON "ipo_listing_performance" USING btree ("listing_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE "ipo_gmp_snapshots" (
	"ipo_id" bigint NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observed_at_basis" text NOT NULL,
	"gmp_paise" bigint,
	"range_low_paise" bigint,
	"range_high_paise" bigint,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ipo_gmp_snapshots_pk" PRIMARY KEY("ipo_id","source","observed_at"),
	CONSTRAINT "ipo_gmp_basis_known" CHECK ("observed_at_basis" IN ('stated','fetched'))
);
--> statement-breakpoint
ALTER TABLE "ipo_gmp_snapshots" ADD CONSTRAINT "ipo_gmp_snapshots_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ipo_gmp_snapshots_latest_idx" ON "ipo_gmp_snapshots" USING btree ("ipo_id","observed_at" DESC NULLS LAST);
--> statement-breakpoint
-- History is append-only. A correction is a new snapshot, never an UPDATE;
-- DELETE stays allowed (cascade from a removed issue).
CREATE OR REPLACE FUNCTION reject_ipo_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only history; record a new snapshot instead', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ipo_subscription_snapshots_no_update" BEFORE UPDATE ON "ipo_subscription_snapshots" FOR EACH ROW EXECUTE FUNCTION reject_ipo_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "ipo_gmp_snapshots_no_update" BEFORE UPDATE ON "ipo_gmp_snapshots" FOR EACH ROW EXECUTE FUNCTION reject_ipo_history_mutation();
--> statement-breakpoint
-- A source record is an observation: only its last-seen time and its match may change.
CREATE OR REPLACE FUNCTION ipo_source_records_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source <> OLD.source OR NEW.feed <> OLD.feed OR NEW.external_key <> OLD.external_key
     OR NEW.source_url <> OLD.source_url OR NEW.payload <> OLD.payload OR NEW.payload_hash <> OLD.payload_hash
     OR NEW.first_seen_at <> OLD.first_seen_at THEN
    RAISE EXCEPTION 'ipo_source_records: an observation is immutable; only last_seen_at and ipo_id may change';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ipo_source_records_freeze" BEFORE UPDATE ON "ipo_source_records" FOR EACH ROW EXECUTE FUNCTION ipo_source_records_freeze();
--> statement-breakpoint
-- Listing-day prices are a historical fact: frozen once written. The latest
-- close (and its date) rolls forward daily.
CREATE OR REPLACE FUNCTION ipo_listing_performance_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.listing_date <> OLD.listing_date OR NEW.issue_price_paise <> OLD.issue_price_paise
     OR NEW.listing_open_paise <> OLD.listing_open_paise OR NEW.listing_high_paise <> OLD.listing_high_paise
     OR NEW.listing_low_paise <> OLD.listing_low_paise OR NEW.listing_close_paise <> OLD.listing_close_paise
     OR NEW.listing_volume <> OLD.listing_volume THEN
    RAISE EXCEPTION 'ipo_listing_performance: listing-day prices are frozen once written';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "ipo_listing_performance_freeze" BEFORE UPDATE ON "ipo_listing_performance" FOR EACH ROW EXECUTE FUNCTION ipo_listing_performance_freeze();
