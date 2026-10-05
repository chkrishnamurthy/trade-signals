-- Hand-written. Portfolio phase 3: an optional real purchase date for an entry
-- (an opening balance typed today for shares bought earlier). Holding period only.

ALTER TABLE "holding_entries" ADD COLUMN "acquired_on" date;--> statement-breakpoint
ALTER TABLE "holding_entries" ADD CONSTRAINT "holding_entries_acquired_before_trade" CHECK ("holding_entries"."acquired_on" is null or "holding_entries"."acquired_on" <= "holding_entries"."trade_date");
