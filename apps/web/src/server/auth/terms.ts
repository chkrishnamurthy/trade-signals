/**
 * The current version of the Terms of Use + Privacy Policy, as a date stamp.
 *
 * Bump this whenever `/terms` or `/privacy` changes materially. New accounts
 * record the version they accepted (`auth_users.terms_version`); the mobile app
 * reads it from `/api/app-config` and shows its terms popup against it
 * (docs/mobile/01-discovery.md S15). A client that agreed to an older version is
 * refused with `TERMS_OUTDATED` so it re-shows the current text.
 */
export const TERMS_VERSION = '2026-09-24';
