-- Per-user isolation: every watchlist and saved view gains an owner.
--
-- Existing rows are backfilled to the admin account (or, failing that, the first
-- user), then the column is made NOT NULL. On a fresh install both tables are
-- empty and the backfill is a no-op. On production this migration must run AFTER
-- an admin account exists (see docs/planning/authentication-plan.md §24); if
-- watchlists exist but no users do, the SET NOT NULL below fails loudly — the
-- correct signal to create the account first.

ALTER TABLE "watchlists" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "watchlist_views" ADD COLUMN "owner_id" integer;--> statement-breakpoint

UPDATE "watchlists" SET "owner_id" = (
  SELECT id FROM auth_users ORDER BY (role = 'admin') DESC, id LIMIT 1
) WHERE "owner_id" IS NULL;--> statement-breakpoint
UPDATE "watchlist_views" SET "owner_id" = (
  SELECT id FROM auth_users ORDER BY (role = 'admin') DESC, id LIMIT 1
) WHERE "owner_id" IS NULL;--> statement-breakpoint

ALTER TABLE "watchlists" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_views" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_views" ADD CONSTRAINT "watchlist_views_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

DROP INDEX "watchlist_views_scope_name_idx";--> statement-breakpoint
DROP INDEX "watchlists_name_idx";--> statement-breakpoint
DROP INDEX "watchlists_single_default_idx";--> statement-breakpoint

CREATE UNIQUE INDEX "watchlist_views_owner_scope_name_idx" ON "watchlist_views" USING btree ("owner_id","scope_id","name");--> statement-breakpoint
CREATE INDEX "watchlist_views_owner_idx" ON "watchlist_views" USING btree ("owner_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_owner_name_idx" ON "watchlists" USING btree ("owner_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_owner_default_idx" ON "watchlists" USING btree ("owner_id") WHERE "watchlists"."is_default";--> statement-breakpoint
CREATE INDEX "watchlists_owner_idx" ON "watchlists" USING btree ("owner_id","position");
