---
name: Public launch Phase 0-3 tracker
status: blocked
horizon: now
created: 2026-10-11
updated: 2026-10-11
area: [product, operations, security, qa]
summary: Actionable status ledger and exit evidence for public-launch phases 0 through 3.
owner: krishna
---

# Public launch Phase 0–3 tracker

Statuses are `Complete`, `In progress`, `Blocked` or `Not started`. A blocker is not waived by
feature completeness.

## Phase 0 — scope and control

| ID | Priority | Task / completion test | Status | Evidence or next action |
| --- | --- | --- | --- | --- |
| P0-01 | P0 | Release source and excluded branches fixed | Complete | `public-launch-phase-0.md`; current `main` only, both feature branches excluded |
| P0-02 | P0 | Product promise, golden journey and exclusions fixed | Complete | Phase 0 record and readiness plan |
| P0-03 | P0 | Supported platform and severity rules fixed | Complete | Phase 0 record |
| P0-04 | P0 | Evidence standard, tracker and risk register exist | Complete | This file and `public-launch-risk-register.md` |
| P0-05 | P0 | Production baseline captured without private user data | Complete | `public-launch-production-readiness-2026-10-11.md` |

**Exit:** Complete. Phase 0 decisions do not approve public launch.

## Phase 1 — release engineering

| ID | Priority | Task / completion test | Status | Evidence or next action |
| --- | --- | --- | --- | --- |
| P1-01 | P0 | Lint, typecheck, production build and Storybook are required CI checks | Complete in code | `.github/workflows/ci.yml`; clean-main baseline passed locally. Staged mobile-generated files remain user-owned and out of release scope. |
| P1-02 | P0 | Unit and real PostgreSQL/TimescaleDB suites cannot silently skip | Complete | CI exports both test DB variables; 178 files / 2,061 tests passed 2026-10-11 |
| P1-03 | P0 | Browser release smoke is required | Complete | `playwright.config.ts`, `test/e2e/release-smoke.spec.ts`; 5/5 local tests passed |
| P1-04 | P0 | Deployment waits for `checks` and `db-tests` | Complete in code | Single CI workflow; duplicate ungated deploy workflow removed |
| P1-05 | P0 | Server deploys the exact green SHA, builds before migrating and uses compatible migrations | Blocked | Current forced VPS script is outside Git and inaccessible from this workstation. Update/verify it with an operations SSH key before merging the CI change. |
| P1-06 | P0 | Post-deploy public smoke runs automatically | Complete in code and live | `scripts/post-deploy-smoke.sh`; live public run passed 2026-10-11 |
| P1-07 | P0 | Rollback and migration procedure rehearsed | Blocked | Requires VPS access and a maintenance window; documentation alone is insufficient |
| P1-08 | P0 | `main` rejects direct/unchecked changes | Blocked at approval | GitHub currently has no classic branch protection. Rules are prepared; user confirmation is required before changing repository access controls. |
| P1-09 | P1 | Versioned release checklist and notes template exist | Complete | `.github/RELEASE_CHECKLIST.md`, `.github/RELEASE_NOTES_TEMPLATE.md` |

**Exit:** Blocked by P1-05, P1-07 and P1-08. Do not merge/deploy the workflow until the forced
server command is verified against the new exact-commit contract.

## Phase 2 — security, privacy, legal and data rights

| ID | Priority | Task / completion test | Status | Evidence or next action |
| --- | --- | --- | --- | --- |
| P2-01 | P0 | Password reset does not enumerate accounts | Complete in code | Generic success response and UI copy; tests/build gate |
| P2-02 | P0 | Proxy-derived client IP resists left-side header spoofing | Complete | Right-most forwarded address plus unit tests |
| P2-03 | P0 | Auth email logging excludes recipients/provider bodies | Complete in code | Status-only/general errors |
| P2-04 | P0 | Cross-user isolation and admin authorization pass | Complete at DB/API layer | Auth and owner-scoped suites passed; full browser IDOR matrix remains Phase 4 |
| P2-05 | P0 | Admin MFA launch policy satisfied | Blocked | Live account security page shows TOTP Off; owner must enable and verify recovery |
| P2-06 | P0 | Legal/grievance details and response windows approved | Blocked | Needs real person/address, owner decisions and qualified counsel |
| P2-07 | P0 | Manual data export and backup-deletion exception are accurate | Blocked | Owner and retention period not supplied; VPS backup configuration not inspected |
| P2-08 | P0 | Data rights cover signed-in display, derived work and promotion | Blocked | `public-launch-data-rights-matrix.md`; FYERS/NSE/InvestorGain/AMFI conflicts or missing agreements |
| P2-09 | P0 | Uploads cannot publish hidden metadata or malicious content | In progress | Size/type bounds pass; avatars still need server re-encoding and existing-file treatment |
| P2-10 | P0 | Incident intake and secret rotation are documented | Complete in docs | `docs/operations/security-incident-response.md`; live contacts still depend on legal approval |
| P2-11 | P0 | VPS secret placement and production-log privacy verified | Blocked | Operations SSH key required |

**Exit:** NO-GO. P2-05 through P2-09/P2-11 contain High blockers.

## Phase 3 — integrations, data and operations

| ID | Priority | Task / completion test | Status | Evidence or next action |
| --- | --- | --- | --- | --- |
| P3-01 | P0 | Fresh DB migration and full integration suite pass | Complete | PostgreSQL 17 + TimescaleDB; 178 files / 2,061 tests, no skips, 2026-10-11 |
| P3-02 | P0 | Production market provider and self-heal are healthy | Blocked | Live app says indices unavailable and asks for re-authorisation; provider is Fyers-only on production data-sources page |
| P3-03 | P0 | Google OAuth production identity is connected | Partially complete | Live profile shows Google connected; new-login redirect/callback flow not rerun |
| P3-04 | P0 | Verification/reset/security/alert emails deliver | Blocked at live test | Code exists; sending live email has not been authorised/exercised in this review |
| P3-05 | P0 | Worker datasets meet freshness windows | Partially complete | Market Brief and IPO feeds were fresh for the latest session; price feed/socket stopped and five paper alerts unresolved |
| P3-06 | P0 | Provider, worker and email failure states are honest | Partially complete | Current unavailable banner is honest; complete route-by-route failure matrix remains open |
| P3-07 | P0 | Nightly backup, off-server copy and restore drill pass | Blocked | VPS access required; no dated restore evidence obtained |
| P3-08 | P0 | Nginx SSE, processes, disk, DB capacity and secrets verified | Blocked | VPS access required |
| P3-09 | P0 | TLS and public security headers pass | Complete | Let's Encrypt certificate valid through 2026-11-29; live smoke passed headers |
| P3-10 | P0 | IPO/feed rights and endpoint behavior are both acceptable | Blocked | Technical feeds were fresh, but InvestorGain/BSE/SEBI rights are unresolved |

**Exit:** NO-GO. The production market provider is unavailable and operational recovery evidence is
missing.

## Required owner inputs / approvals

1. Provide operations SSH access or run the redacted VPS verification pack so P1-05/P1-07 and
   P2-11/P3-07/P3-08 can close.
2. Approve changing GitHub `main` access controls when ready: require pull requests, `checks` and
   `db-tests`; block force-push and deletion; include administrators.
3. Enable admin TOTP and confirm recovery-code custody.
4. Supply grievance officer legal name/postal address, support/data-export owner, and desired
   acknowledgement/resolution windows for counsel review.
5. Obtain written source agreements/permissions; choose which unresolved feeds must be disabled.
6. Authorise a production email-flow test to the owner's test address and a Google re-login test.
