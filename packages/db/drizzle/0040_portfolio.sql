-- Hand-written. Portfolio phase 1: a user's own typed or uploaded share entries.
-- One row per event; holdings are derived on read. Totals are integer paise.

CREATE TABLE "holding_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "holding_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"kind" text NOT NULL,
	"trade_date" date NOT NULL,
	"shares" integer NOT NULL,
	"amount_paise" bigint NOT NULL,
	"source" text NOT NULL,
	"trade_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holding_entries_kind_check" CHECK ("holding_entries"."kind" in ('opening', 'add', 'remove')),
	CONSTRAINT "holding_entries_source_check" CHECK ("holding_entries"."source" in ('manual', 'file')),
	CONSTRAINT "holding_entries_shares_positive" CHECK ("holding_entries"."shares" > 0),
	CONSTRAINT "holding_entries_amount_nonnegative" CHECK ("holding_entries"."amount_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "holding_entries" ADD CONSTRAINT "holding_entries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_entries" ADD CONSTRAINT "holding_entries_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holding_entries_owner_idx" ON "holding_entries" USING btree ("owner_id","instrument_id","trade_date");--> statement-breakpoint
CREATE INDEX "holding_entries_instrument_idx" ON "holding_entries" USING btree ("instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holding_entries_owner_trade_idx" ON "holding_entries" USING btree ("owner_id","trade_id") WHERE "holding_entries"."trade_id" is not null;
