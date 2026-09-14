CREATE TABLE "announcement_ingestion_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "announcement_ingestion_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"fetched" integer NOT NULL,
	"written" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_user_state" (
	"owner_id" integer NOT NULL,
	"announcement_id" bigint NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_checksum" text,
	"saved" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"issue_reported" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_user_state_owner_id_announcement_id_pk" PRIMARY KEY("owner_id","announcement_id")
);
--> statement-breakpoint
CREATE TABLE "announcement_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "announcement_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"announcement_id" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"checksum" text,
	"interpretation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corporate_announcements" ADD COLUMN "interpretation" jsonb;--> statement-breakpoint
ALTER TABLE "corporate_announcements" ADD COLUMN "interpretation_checksum" text;--> statement-breakpoint
ALTER TABLE "announcement_user_state" ADD CONSTRAINT "announcement_user_state_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_user_state" ADD CONSTRAINT "announcement_user_state_announcement_id_corporate_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."corporate_announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_announcement_id_corporate_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."corporate_announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_ingestion_runs_completed_idx" ON "announcement_ingestion_runs" USING btree ("completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "announcement_versions_item_idx" ON "announcement_versions" USING btree ("announcement_id","id" DESC NULLS LAST);