---
name: Public launch security and privacy review
status: in-progress
horizon: now
created: 2026-10-11
updated: 2026-10-11
area: [security, privacy, auth, operations]
summary: Phase 2 findings, remediations and unresolved public-launch controls.
owner: krishna
---

# Public launch security and privacy review

## Result

The main-branch design has strong foundations, but Phase 2 is **not approved**. Admin MFA is off,
legal/grievance details are unfinished, data rights are blocked, avatar uploads retain metadata,
and VPS secret/backup controls could not be inspected with the available deploy-only credentials.

## Verified controls

| Control | Evidence | Result |
| --- | --- | --- |
| Authentication and authorization | Route-auth inventory covers 100 routes; protected API smoke returns the shared 401 shape | Pass |
| Auth database behavior | `apps/web/src/server/auth/db-integration.test.ts`, five tests included in the 2026-10-11 real-DB run | Pass |
| Cross-user portfolio isolation | Repository/API database suites create multiple owners and assert owner-scoped results | Pass |
| Cross-user alerts/watchlists | Owner IDs are enforced in repository boundaries; database constraints and route auth are tested | Pass, add browser IDOR coverage in Phase 4 |
| CSRF / same-origin writes | Mutation routes use the shared origin check; dedicated tests pass | Pass |
| Session cookies | HttpOnly/Secure/SameSite handling is implemented and tested | Pass |
| Security headers | Live smoke verified HSTS, CSP and `X-Content-Type-Options: nosniff` | Pass |
| Password reset privacy | Unknown email now returns the same success response/copy as a known account | Remediated 2026-10-11 |
| Proxy client IP | Rate-limit identity now uses the right-most proxy-observed `X-Forwarded-For` address | Remediated and unit-tested 2026-10-11 |
| Email log privacy | Recipient addresses and provider response bodies were removed from application logs | Remediated 2026-10-11 |
| Upload bounds | Avatar 2 MiB; portfolio uploads have file/page/row/type limits and structured parsing | Pass with avatar metadata exception below |
| Account deletion | Account-owned rows cascade; local avatar cleanup and session invalidation are implemented | Code/DB pass; backup-retention copy needs approval |
| Financial data logging | Portfolio routes and event payloads avoid holdings/shares/cost details | Code review pass; production log sampling remains open |

## Open launch blockers

| ID | Severity | Finding | Required closure |
| --- | --- | --- | --- |
| SEC-01 | High | Production admin account shows two-factor authentication **Off**. | Enable TOTP for every admin, store recovery codes safely, then verify login and recovery; or record a formal owner risk acceptance with a time limit and compensating restriction. |
| SEC-02 | High | Market/exchange data rights are not established and some published terms conflict with current use. | Close every blocked/unknown row in `public-launch-data-rights-matrix.md`; disable affected feeds until then. |
| SEC-03 | High | Public legal copy lacks the real grievance officer name/address and professional approval. | Supply real details, approve response windows and obtain counsel review. |
| SEC-04 | High | Uploaded avatars are stored byte-for-byte, so EXIF/GPS or other embedded metadata may be served publicly. | Re-encode to a bounded raster format with metadata stripped, test it, and migrate/re-upload existing local avatars. |
| SEC-05 | High | Production `.env` permissions, secret contents, SSH hardening, database bind and backup access were not re-verified because the local machine has no operations SSH key. | Run the Phase 3 VPS command pack with an operations key and attach redacted output. |
| SEC-06 | High | Backup retention after account deletion is not stated precisely in public copy. | Record backup retention duration, access restrictions and purge behavior; align Privacy/Terms and support responses. |

## Medium findings / next release gate

| ID | Finding | Treatment |
| --- | --- | --- |
| SEC-07 | CSP still permits inline script/style needed by the current Next/theme implementation. | Inventory inline execution, adopt nonces/hashes where practical, and keep `object-src 'none'`, frame restrictions and no user-authored HTML. |
| SEC-08 | End-to-end cross-user IDOR coverage does not yet exercise every watchlist/saved-screen/profile URL. | Add browser/API abuse cases in Phase 4 even though repository owner scoping is present. |
| SEC-09 | Production logs have not been sampled for historical email/portfolio leakage. | Search a bounded log window on the VPS and redact/delete only under the incident procedure. |
| SEC-10 | Vulnerability intake is only the general support path. | Publish a dedicated security-reporting route or documented email workflow before broad promotion. |

## Admin access policy

- Admins are individual accounts; no shared credentials.
- TOTP is required for public launch.
- Google connection is not a substitute for the second factor.
- Recovery codes stay outside source control and the VPS.
- Review active sessions before launch and revoke stale devices.
- Admin routes and APIs must return 403 to normal users; do not expose portfolio content in admin
  surfaces.

## Phase 2 exit decision

**NO-GO as of 2026-10-11.** SEC-01 through SEC-06 must close. Code-side remediations completed in
this review should remain in the release candidate, but they do not compensate for missing rights,
legal approval, MFA or server evidence.
