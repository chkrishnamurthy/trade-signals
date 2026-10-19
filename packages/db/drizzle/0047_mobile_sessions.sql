-- Mobile (Android) client support described in docs/mobile/01-discovery.md §7.
-- Sessions record which client holds them (cookie vs bearer) and a device label;
-- users record which Terms version they accepted. Additive only.

ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "client" text DEFAULT 'web' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "device_name" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_client_check'
  ) THEN
    ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_client_check"
      CHECK ("client" in ('web', 'mobile'));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "auth_users"
  ADD COLUMN IF NOT EXISTS "terms_version" text;
--> statement-breakpoint
-- Native Google sign-in stores a single-use nonce as a challenge.
ALTER TABLE "auth_challenges" DROP CONSTRAINT IF EXISTS "auth_challenges_purpose_check";
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_purpose_check"
  CHECK ("purpose" in ('google_oauth', 'google_native', 'mfa', 'reauth'));
