-- Hand-written. SEBI public-issue filings (DRHPs and their addenda):
-- docs/planning/ipos-plan.md Phase 11.
--
-- A filing is NOT an announced issue — many never open — so it never creates
-- or changes an `ipo_issues` row. It is linked to one (`ipo_id`) only on an
-- exact normalised-name match, for display. Rows are keyed by SEBI's own id
-- and only `last_seen_at` / `ipo_id` change after insert.

CREATE TABLE "ipo_sebi_filings" (
	"sebi_id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"document_label" text,
	"title" text NOT NULL,
	"filed_date" date NOT NULL,
	"page_url" text NOT NULL,
	"abridged_url" text,
	"ipo_id" bigint,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ipo_sebi_filings" ADD CONSTRAINT "ipo_sebi_filings_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ipo_sebi_filings_filed_idx" ON "ipo_sebi_filings" USING btree ("filed_date" DESC);
--> statement-breakpoint
CREATE INDEX "ipo_sebi_filings_ipo_idx" ON "ipo_sebi_filings" USING btree ("ipo_id");
