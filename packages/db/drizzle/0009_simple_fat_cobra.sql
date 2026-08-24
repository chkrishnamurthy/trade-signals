CREATE TABLE "watchlist_layouts" (
	"watchlist_id" integer PRIMARY KEY NOT NULL,
	"columns" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sort" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quick_view" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_views" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlist_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"watchlist_id" integer,
	"scope_id" integer GENERATED ALWAYS AS (COALESCE(watchlist_id, 0)) STORED,
	"name" text NOT NULL,
	"columns" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sort" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_layouts" ADD CONSTRAINT "watchlist_layouts_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_views" ADD CONSTRAINT "watchlist_views_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_views_scope_name_idx" ON "watchlist_views" USING btree ("scope_id","name");--> statement-breakpoint
CREATE INDEX "watchlist_views_watchlist_idx" ON "watchlist_views" USING btree ("watchlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_single_default_idx" ON "watchlists" USING btree ("is_default") WHERE "watchlists"."is_default";