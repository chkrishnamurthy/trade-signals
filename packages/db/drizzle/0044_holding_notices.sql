-- Hand-written. Portfolio phase 6.2: in-app notices about the user's own holdings
-- (dividends and corporate actions coming up, a share change applied, a large daily
-- move, a purchase turning long term), and each user's choice of which to get.
-- Facts only; never an instruction. Private to the owner (CLAUDE.md rule 9).
-- `data` holds the facts (paise, dates, counts); the page writes the sentence,
-- so money becomes text only at the presentation boundary (rule 3).

CREATE TABLE "holding_notices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "holding_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"kind" text NOT NULL,
	"instrument_id" integer,
	"dedupe_key" text NOT NULL,
	"notice_date" date NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "holding_notices_kind_check" CHECK ("holding_notices"."kind" in ('event_soon', 'share_change', 'stock_move', 'portfolio_move', 'long_term_soon'))
);
--> statement-breakpoint
ALTER TABLE "holding_notices" ADD CONSTRAINT "holding_notices_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_notices" ADD CONSTRAINT "holding_notices_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holding_notices_dedupe_idx" ON "holding_notices" USING btree ("owner_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "holding_notices_owner_idx" ON "holding_notices" USING btree ("owner_id","created_at" DESC);--> statement-breakpoint
CREATE TABLE "holding_notice_settings" (
	"owner_id" integer PRIMARY KEY NOT NULL,
	"events" boolean DEFAULT true NOT NULL,
	"share_changes" boolean DEFAULT true NOT NULL,
	"stock_moves" boolean DEFAULT true NOT NULL,
	"stock_move_percent" integer DEFAULT 5 NOT NULL,
	"portfolio_moves" boolean DEFAULT true NOT NULL,
	"portfolio_move_percent" integer DEFAULT 3 NOT NULL,
	"long_term" boolean DEFAULT true NOT NULL,
	"long_term_days" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_notice_settings_ranges" CHECK ("holding_notice_settings"."stock_move_percent" between 1 and 50 and "holding_notice_settings"."portfolio_move_percent" between 1 and 50 and "holding_notice_settings"."long_term_days" between 1 and 90)
);
--> statement-breakpoint
ALTER TABLE "holding_notice_settings" ADD CONSTRAINT "holding_notice_settings_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;
