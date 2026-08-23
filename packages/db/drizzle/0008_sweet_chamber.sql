CREATE TABLE "provider_credentials" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
