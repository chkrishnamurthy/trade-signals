-- Hand-written. RHP extracts: docs/planning/ipos-plan.md Phase 11.
--
-- A row is one section the extractor could read with confidence (overview,
-- objects, promoters, financials, strengths, risks), quoted from the document
-- with its PDF pages. Financial figures stay the document's own text, never
-- numbers EquityWise computes with. A newer extractor version replaces a
-- document's rows wholesale; nothing else writes here.

ALTER TABLE "ipo_documents" ADD COLUMN "extractor_version" integer;
--> statement-breakpoint
ALTER TABLE "ipo_documents" ADD COLUMN "extracted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ipo_documents" ADD COLUMN "extract_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ipo_documents" ADD COLUMN "extract_error" text;
--> statement-breakpoint
CREATE TABLE "ipo_rhp_extracts" (
	"document_id" bigint NOT NULL,
	"ipo_id" bigint NOT NULL,
	"section" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"table_data" jsonb,
	"page_from" integer NOT NULL,
	"page_to" integer NOT NULL,
	"extractor_version" integer NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ipo_rhp_extracts_pk" PRIMARY KEY("document_id","section"),
	CONSTRAINT "ipo_rhp_extracts_section_known" CHECK ("section" IN ('overview','objects','promoters','financials','strengths','risks')),
	CONSTRAINT "ipo_rhp_extracts_pages" CHECK ("page_from" >= 1 AND "page_to" >= "page_from"),
	CONSTRAINT "ipo_rhp_extracts_has_content" CHECK ("body" IS NOT NULL OR jsonb_array_length("items") > 0 OR "table_data" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "ipo_rhp_extracts" ADD CONSTRAINT "ipo_rhp_extracts_document_id_ipo_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ipo_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ipo_rhp_extracts" ADD CONSTRAINT "ipo_rhp_extracts_ipo_id_ipo_issues_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipo_issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ipo_rhp_extracts_ipo_idx" ON "ipo_rhp_extracts" USING btree ("ipo_id");
