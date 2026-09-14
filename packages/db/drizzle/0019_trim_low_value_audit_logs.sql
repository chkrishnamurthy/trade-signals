-- Keep the permanent security audit focused.
--
-- The audit table remains append-only after this migration. This one-time cleanup
-- removes low-value routine events and scrubs old browser strings that were
-- previously stored in user_agent.

ALTER TABLE auth_audit DISABLE TRIGGER auth_audit_no_mutation;
--> statement-breakpoint
UPDATE auth_audit
SET user_agent = NULL
WHERE user_agent IS NOT NULL;
--> statement-breakpoint
DELETE FROM auth_audit
WHERE event IN ('logout', 'email_verified', 'verification_resent');
--> statement-breakpoint
ALTER TABLE auth_audit ENABLE TRIGGER auth_audit_no_mutation;
