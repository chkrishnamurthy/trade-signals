-- Per-user isolation: watchlists and saved views gain an owner.
--
-- Written to be SELF-HEALING and IDEMPOTENT so it is safe to re-run after a
-- failed deploy, and so a FIRST auth deploy onto a database that already has
-- watchlists (no accounts yet) does not fail:
--   * backfills existing rows to the admin (or first) account, if one exists;
--   * enforces NOT NULL only when every row has an owner — otherwise it leaves
--     owner_id NULLABLE and warns, to be finalised once the admin exists.
-- Legacy rows left with a NULL owner are simply invisible to every user until an
-- owner is assigned; they are never lost.

ALTER TABLE "watchlists" ADD COLUMN IF NOT EXISTS "owner_id" integer;--> statement-breakpoint
ALTER TABLE "watchlist_views" ADD COLUMN IF NOT EXISTS "owner_id" integer;--> statement-breakpoint

UPDATE "watchlists" SET "owner_id" = (
  SELECT id FROM auth_users ORDER BY (role = 'admin') DESC, id LIMIT 1
) WHERE "owner_id" IS NULL;--> statement-breakpoint
UPDATE "watchlist_views" SET "owner_id" = (
  SELECT id FROM auth_users ORDER BY (role = 'admin') DESC, id LIMIT 1
) WHERE "owner_id" IS NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM watchlists WHERE owner_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM watchlist_views WHERE owner_id IS NULL) THEN
    EXECUTE 'ALTER TABLE watchlists ALTER COLUMN owner_id SET NOT NULL';
    EXECUTE 'ALTER TABLE watchlist_views ALTER COLUMN owner_id SET NOT NULL';
  ELSE
    RAISE WARNING 'watchlists.owner_id left NULLABLE: legacy rows exist with no account to own them. Create the admin, assign owners, then enforce NOT NULL.';
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watchlists_owner_id_auth_users_id_fk') THEN
    ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_owner_id_auth_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watchlist_views_owner_id_auth_users_id_fk') THEN
    ALTER TABLE "watchlist_views" ADD CONSTRAINT "watchlist_views_owner_id_auth_users_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade;
  END IF;
END $$;--> statement-breakpoint

DROP INDEX IF EXISTS "watchlist_views_scope_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "watchlists_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "watchlists_single_default_idx";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_views_owner_scope_name_idx" ON "watchlist_views" USING btree ("owner_id","scope_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_views_owner_idx" ON "watchlist_views" USING btree ("owner_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlists_owner_name_idx" ON "watchlists" USING btree ("owner_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlists_owner_default_idx" ON "watchlists" USING btree ("owner_id") WHERE "is_default";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlists_owner_idx" ON "watchlists" USING btree ("owner_id","position");
