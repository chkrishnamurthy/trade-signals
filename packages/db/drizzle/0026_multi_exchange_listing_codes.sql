-- NSE + BSE as equal exchanges (docs/planning/multi-exchange-nse-bse-plan.md).
-- Additive only: both columns are nullable, existing NSE rows are untouched.

ALTER TABLE "instruments"
  ADD COLUMN IF NOT EXISTS "exchange_code" text;
--> statement-breakpoint
ALTER TABLE "instruments"
  ADD COLUMN IF NOT EXISTS "series" text;
--> statement-breakpoint
-- BSE's bhavcopy, filings and deals name a security by its scrip code.
CREATE INDEX IF NOT EXISTS "instruments_exchange_code_idx"
  ON "instruments" ("exchange", "exchange_code")
  WHERE "exchange_code" IS NOT NULL;
--> statement-breakpoint
-- A company's listings on both exchanges are joined by ISIN.
CREATE INDEX IF NOT EXISTS "instruments_isin_idx"
  ON "instruments" ("isin")
  WHERE "isin" IS NOT NULL;
