-- Hand-written. Generalises the append-only `auth_audit` into `event_log`
-- (docs/planning/logging-plan.md, phase 1). Additive: every existing row, column,
-- index and the append-only trigger are kept under new names; existing rows get the
-- defaults `category = 'auth'`, `actor_type = 'user'`.

ALTER TABLE "auth_audit" RENAME TO "event_log";--> statement-breakpoint
ALTER TABLE "event_log" RENAME CONSTRAINT "auth_audit_pkey" TO "event_log_pkey";--> statement-breakpoint
ALTER SEQUENCE "auth_audit_id_seq" RENAME TO "event_log_id_seq";--> statement-breakpoint
ALTER INDEX "auth_audit_at_idx" RENAME TO "event_log_at_idx";--> statement-breakpoint
ALTER INDEX "auth_audit_user_idx" RENAME TO "event_log_user_idx";--> statement-breakpoint
ALTER TRIGGER "auth_audit_no_mutation" ON "event_log" RENAME TO "event_log_no_mutation";--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "category" text DEFAULT 'auth' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_log" ADD COLUMN "actor_type" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX "event_log_category_at_idx" ON "event_log" USING btree ("category","at" DESC NULLS LAST);--> statement-breakpoint
-- The trigger function is shared with other append-only tables, so its message must
-- not name one table.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (INSERT only)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
