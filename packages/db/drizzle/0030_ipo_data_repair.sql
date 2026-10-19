-- Hand-written, data only (no schema change). Repairs IPO rows written before
-- the parser fixes of 2026-10-03 (docs/operations/ipo-pipeline.md, "Repairs").
-- Idempotent and a no-op on a fresh database.
--
-- 1. NSE's past-issue list carries "- Withdrawal Window" / "-Special Withdrawal
--    Option" rows: windows for bidders to withdraw from an existing issue, not
--    issues. The parser now skips them; here their stored observations go, and
--    so does any issue that only such a row created (it has nothing left).
DELETE FROM "ipo_source_records"
WHERE "payload"->>'companyName' ~* '-\s*(special\s+)?withdrawal\s+(window|option)\s*$';
--> statement-breakpoint
DELETE FROM "ipo_issues" i
WHERE i."company_name" ~* '-\s*(special\s+)?withdrawal\s+(window|option)\s*$'
  AND i."listing_date" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ipo_source_records" r WHERE r."ipo_id" = i."id");
--> statement-breakpoint
-- 2. Addresses minted from a name that still carried NSE's status suffix
--    ("…-Issue Withdrawn", "…-Special Withdrawal Option"). The resolver now
--    corrects the name and status on its next run; the slug is cleaned here,
--    only where the clean slug is free.
UPDATE "ipo_issues" i
SET "slug" = c.clean
FROM (
  SELECT "id",
         regexp_replace(
           "slug",
           '-(issue-withdrawn|issue-postponed|issue-deferred|issue-cancelled|special-withdrawal-option|withdrawal-window)(-ipo-)',
           '\2'
         ) AS clean
  FROM "ipo_issues"
) c
WHERE c."id" = i."id"
  AND c.clean <> i."slug"
  AND NOT EXISTS (SELECT 1 FROM "ipo_issues" o WHERE o."slug" = c.clean);
--> statement-breakpoint
-- 3. SME subscription read from NSE's category endpoint, which states 0 shares
--    offered in every category and leaves the individual investors out. Such a
--    reading (consolidated, SME, nothing offered, no retail row) is dropped;
--    the detail payload's complete book replaces it on the next run.
DELETE FROM "ipo_subscription_snapshots" s
USING (
  SELECT x."ipo_id", x."scope", x."as_of"
  FROM "ipo_subscription_snapshots" x
  JOIN "ipo_issues" i ON i."id" = x."ipo_id"
  WHERE i."board" = 'sme' AND x."scope" = 'consolidated'
  GROUP BY x."ipo_id", x."scope", x."as_of"
  HAVING coalesce(max(x."shares_offered"), 0) = 0
     AND bool_and(x."category" <> 'retail')
) bad
WHERE s."ipo_id" = bad."ipo_id" AND s."scope" = bad."scope" AND s."as_of" = bad."as_of";
