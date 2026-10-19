-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Stock page
-- header: docs/planning/stock-header-redesign-plan.md §6.
--
-- dividends is worker-written and append-only, kept apart from
-- corporate_actions because every corporate_actions row adjusts prices on
-- read and prices stay dividend-unadjusted. user_ratio_layouts is per-user.

CREATE TABLE "dividends" (
	"instrument_id" integer NOT NULL,
	"ex_date" date NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer,
	"subject" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dividends_instrument_id_ex_date_kind_pk" PRIMARY KEY("instrument_id","ex_date","kind"),
	CONSTRAINT "dividends_kind_known" CHECK ("kind" IN ('interim','final','special','dividend')),
	CONSTRAINT "dividends_amount_positive" CHECK ("amount_paise" IS NULL OR "amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "dividends_ex_date_idx" ON "dividends" USING btree ("ex_date");
--> statement-breakpoint
CREATE TABLE "user_ratio_layouts" (
	"owner_id" integer PRIMARY KEY NOT NULL,
	"keys" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_ratio_layouts_keys_array" CHECK (jsonb_typeof("keys") = 'array')
);
--> statement-breakpoint
ALTER TABLE "user_ratio_layouts" ADD CONSTRAINT "user_ratio_layouts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "screener_snapshots" ADD COLUMN "dividend_ttm" integer;
--> statement-breakpoint
ALTER TABLE "screener_snapshots" ADD COLUMN "dividend_yield" double precision;
