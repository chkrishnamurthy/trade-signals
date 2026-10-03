-- Hand-written, data only (no schema change). Repairs rows the first history
-- load wrote before the fixes of 2026-10-03 (docs/operations/ipo-pipeline.md,
-- "Repairs"). Idempotent and a no-op on a fresh database. The next history
-- load (which runs on start until it completes) fetches the replacements.
--
-- 1. Not IPOs: follow-on offers ("Vodafone Idea Limited - FPO", IDEAFPO) and
--    the numbered partly-paid line of a listed company's rights issue
--    (ADANIENPP1). The parser now skips them; their observations go, and so
--    does any issue only such rows created. A bare PP suffix is a real IPO
--    (CLOUDPP, SILGOPP) and is left alone.
DELETE FROM "ipo_source_records"
WHERE "payload"->>'companyName' ~* '-\s*FPO\s*$'
   OR upper("payload"->>'symbol') ~ '(FPO|PP[0-9]+)$';
--> statement-breakpoint
DELETE FROM "ipo_issues" i
WHERE (i."company_name" ~* '-\s*FPO\s*$' OR upper(coalesce(i."nse_symbol", '')) ~ '(FPO|PP[0-9]+)$')
  AND NOT EXISTS (SELECT 1 FROM "ipo_source_records" r WHERE r."ipo_id" = i."id");
--> statement-breakpoint
-- 2. A closed issue's final figure stamped with the time it was COLLECTED, days
--    after the close (NSE empties `demandDataNSE` on closed issues; the parser
--    now reads `demandGraph`'s time). Such a reading misdates history; the
--    history load replaces it with the consolidated final at its stated time.
DELETE FROM "ipo_subscription_snapshots" s
USING "ipo_issues" i
WHERE i."id" = s."ipo_id"
  AND s."as_of_basis" = 'fetched'
  AND i."close_date" IS NOT NULL
  AND s."fetched_at" > ((i."close_date" + 2)::timestamp AT TIME ZONE 'Asia/Kolkata');
--> statement-breakpoint
-- 3. An SME book read as "NSE only" because its total differed from the
--    graph's (old issues). Every SME book is the whole book; the history load
--    reads it again as such.
DELETE FROM "ipo_subscription_snapshots" s
USING (
  SELECT x."ipo_id", x."as_of"
  FROM "ipo_subscription_snapshots" x
  JOIN "ipo_issues" i ON i."id" = x."ipo_id"
  WHERE i."board" = 'sme' AND x."scope" = 'nse'
  GROUP BY x."ipo_id", x."as_of"
  HAVING bool_and(x."shares_offered" IS NULL)
) bad
WHERE s."ipo_id" = bad."ipo_id" AND s."scope" = 'nse' AND s."as_of" = bad."as_of";
