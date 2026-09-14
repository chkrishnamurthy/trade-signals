-- Hand-written: preserve pre-upgrade evidence and enforce immutable versions.
INSERT INTO announcement_versions (announcement_id, snapshot, created_at)
SELECT id, jsonb_build_object(
  'source', source, 'externalId', external_id, 'symbol', symbol, 'companyName', company_name,
  'category', category, 'headline', headline, 'detail', detail, 'attachmentUrl', attachment_url,
  'announcedAt', to_char(announced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
), now() FROM corporate_announcements;
--> statement-breakpoint
CREATE FUNCTION reject_announcement_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Announcement versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER announcement_versions_immutable BEFORE UPDATE OR DELETE ON announcement_versions
FOR EACH ROW EXECUTE FUNCTION reject_announcement_version_mutation();
