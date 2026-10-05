-- Hand-written. Portfolio usage: counts and dates per user, never holdings.

CREATE TABLE "portfolio_usage" (
	"owner_id" integer PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_days" integer DEFAULT 1 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"imports" integer DEFAULT 0 NOT NULL,
	"entries_added" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_usage" ADD CONSTRAINT "portfolio_usage_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
