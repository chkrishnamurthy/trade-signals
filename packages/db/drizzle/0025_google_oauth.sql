-- Direct Google OAuth 2.0 and session provenance described in docs/planning/google-oauth-plan.md.

ALTER TABLE "auth_users"
  ADD COLUMN IF NOT EXISTS "security_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_mfa"
  ADD COLUMN IF NOT EXISTS "last_used_step" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL,
  "provider_type" text NOT NULL,
  "provider_subject" text NOT NULL,
  "provider_email" text,
  "provider_email_verified" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "disabled_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_provider_type_check'
  ) THEN
    ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_provider_type_check"
      CHECK ("provider_type" in ('google'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_identities_user_id_auth_users_id_fk'
  ) THEN
    ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_auth_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_identities_user_idx" ON "auth_identities" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_principal_idx" ON "auth_identities" USING btree
  ("provider_type", "provider_subject");
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "security_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "authentication_method" text DEFAULT 'password' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "auth_identity_id" integer;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "authenticated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "mfa_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "auth_sessions"
  ADD COLUMN IF NOT EXISTS "reauthenticated_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_auth_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_auth_identity_id_auth_identities_id_fk"
      FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_authentication_method_check'
  ) THEN
    ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_authentication_method_check"
      CHECK ("authentication_method" in ('password', 'google'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_identity_idx" ON "auth_sessions" USING btree ("auth_identity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_challenges" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "user_id" integer,
  "session_id" integer,
  "identity_id" integer,
  "browser_binding_hash" text,
  "security_version" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_purpose_check'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_purpose_check"
      CHECK ("purpose" in ('google_oauth','mfa','reauth'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_attempts_check'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_attempts_check"
      CHECK ("attempts" >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_max_attempts_check'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_max_attempts_check"
      CHECK ("max_attempts" between 1 and 10);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_user_id_auth_users_id_fk'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_auth_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_session_id_auth_sessions_id_fk'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_session_id_auth_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_challenges_identity_id_auth_identities_id_fk'
  ) THEN
    ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_identity_id_auth_identities_id_fk"
      FOREIGN KEY ("identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_challenges_token_idx" ON "auth_challenges" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_user_idx" ON "auth_challenges" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");
