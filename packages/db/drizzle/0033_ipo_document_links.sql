-- Hand-written, data only (no schema change). Repairs IPO document links cut
-- short before the NSE parser learned to join links NSE splits with a stray
-- space ("RHP_PRANAV .zip", "RHP_ SRM.zip"; docs/operations/ipo-pipeline.md,
-- "Repairs"). The parser keeps the whole link from now on, but these issues
-- are past the detail window and will not be read again, so their stored rows
-- are corrected here. Each new link was checked against NSE's archive.
-- Idempotent and a no-op on a fresh database.
UPDATE "ipo_documents" d
SET "url" = f.fixed
FROM (
  VALUES
    ('PRANAV',   'https://nsearchives.nseindia.com/content/ipo/RHP_PRANAV',      'https://nsearchives.nseindia.com/content/ipo/RHP_PRANAV.zip'),
    ('PRANAV',   'https://nsearchives.nseindia.com/content/ipo/RATIOS_PRANAV',   'https://nsearchives.nseindia.com/content/ipo/RATIOS_PRANAV.zip'),
    ('SAWALIYA', 'https://nsearchives.nseindia.com/content/ipo/RHP_SAWALIYA',    'https://nsearchives.nseindia.com/content/ipo/RHP_SAWALIYA.zip'),
    ('SAWALIYA', 'https://nsearchives.nseindia.com/content/ipo/RATIOS_SAWALIYA', 'https://nsearchives.nseindia.com/content/ipo/RATIOS_SAWALIYA.zip'),
    ('SRM',      'https://nsearchives.nseindia.com/content/ipo/RHP_',            'https://nsearchives.nseindia.com/content/ipo/RHP_SRM.zip'),
    ('SRM',      'https://nsearchives.nseindia.com/content/ipo/RATIOS_',         'https://nsearchives.nseindia.com/content/ipo/RATIOS_SRM.zip')
) AS f(symbol, broken, fixed)
JOIN "ipo_issues" i ON i."nse_symbol" = f.symbol
WHERE d."ipo_id" = i."id"
  AND d."url" = f.broken
  AND NOT EXISTS (
    SELECT 1 FROM "ipo_documents" o WHERE o."ipo_id" = d."ipo_id" AND o."url" = f.fixed
  );
--> statement-breakpoint
-- A cut-short RHP's failed reads were the broken link's, not the document's:
-- its attempts start over so the RHP job reads it on its next run.
UPDATE "ipo_documents"
SET "extract_attempts" = 0, "extract_error" = NULL
WHERE "kind" = 'rhp'
  AND "extracted_at" IS NULL
  AND "extract_error" LIKE 'SourceHttpError: https://nsearchives.nseindia.com/content/ipo/% responded 404'
  AND "url" ~* '\.(pdf|zip)$'
  AND "extract_error" NOT LIKE '%' || "url" || ' %';
