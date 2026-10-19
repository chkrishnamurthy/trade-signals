-- Hand-written (the drizzle-kit snapshot chain stops at 0017). Announcement
-- ingestion failures record their reason, as feed_ingestion_runs already does,
-- so a failed run can be diagnosed from the table instead of the process log.
ALTER TABLE "announcement_ingestion_runs" ADD COLUMN IF NOT EXISTS "error" text;
