---
name: Production readiness evidence 2026-10-11
status: no-go
horizon: now
created: 2026-10-11
updated: 2026-10-11
area: [operations, qa, integrations]
summary: Dated, privacy-safe release evidence for the live service and local release candidate.
owner: krishna
---

# Production readiness evidence — 2026-10-11

## Decision

**NO-GO for public promotion or unrestricted sign-up.** Public pages and the existing signed-in
application respond, but the primary market provider is unavailable, data-use rights are blocked,
admin MFA is off, and VPS backup/deploy/process evidence could not be obtained.

## Release-candidate evidence

| Check | Result |
| --- | --- |
| Source | Current `main` only; `feat/mobile-app` and `feat/multi-exchange-bse` excluded |
| Typecheck | Pass |
| Production build | Pass |
| Storybook build | Pass |
| Browser smoke | 5/5 pass: landing, tour, trust pages, protected redirect/API, headers/SEO |
| Real DB integration | 178 files and 2,061 tests pass, no skips, PostgreSQL 17 + TimescaleDB |
| DB migrations | Pass from fresh disposable database |
| Lint | Application code passes when current user-owned generated mobile files are excluded; clean `main` does not contain those generated files |

## Live public evidence

| Check | Result |
| --- | --- |
| HTTPS | Pass; certificate CN `equitywise.io`, Let's Encrypt, valid 2026-08-31 through 2026-11-29 |
| Public routes | Home, About/Privacy trust paths and robots respond successfully |
| Protected API | Unauthenticated request returns the shared 401 response |
| Headers | HSTS, CSP and `nosniff` present |
| Post-deploy smoke script | Pass against `https://equitywise.io` |

## Live authenticated evidence

The review used read-only UI inspection and intentionally excludes names, email addresses,
IP addresses, watchlist content and portfolio values from this record.

| Surface | Observation | Decision |
| --- | --- | --- |
| Market Brief | Latest completed session visible for 2026-10-09 with a build timestamp | Fresh for the last completed session |
| Global market status | “Status unknown”; indices unavailable; UI requests re-authorisation | **Blocker** |
| Data sources | Production reports Fyers-only routing | Rights and availability blocker |
| Admin paper health | Price feed closed, last sample never, socket stopped, five unresolved alerts | **Blocker** |
| IPO feed admin | NSE/SEBI/InvestorGain jobs showed recent successful timestamps; RHP queue active | Technically fresh; rights blocker remains |
| Account security | Google identity connected; administrator TOTP off | **Blocker** |
| Account deletion UI | User-visible destructive scope is explained | Code/DB verified; backup-retention wording open |

## Evidence not obtained

The workstation's deploy key is intentionally forced-command-only and cannot open an operations
shell. Therefore the following are unverified, not assumed healthy:

- PM2 process status/restarts and current deployed SHA;
- Nginx configuration and live SSE buffering/timeout behavior;
- filesystem/database capacity and PostgreSQL localhost binding;
- production `.env` ownership/mode and secret inventory;
- latest local/off-server backups and a measured restore drill;
- the server deploy script's exact-SHA, build-before-migrate and rollback behavior;
- bounded production-log redaction review.

## Required retest sequence

1. Resolve source licences and disable every unapproved feed.
2. Repair/replace the production provider credential and observe one market session.
3. Enable admin TOTP.
4. Run the redacted VPS verification and restore drill with an operations key.
5. Verify the forced deploy script accepts the approved SHA, builds before migrations and keeps
   migrations compatible with the previous application revision.
6. Run authorised Google-login and transactional-email delivery tests.
7. Re-run CI, deploy the exact green SHA, and attach the automated post-deploy smoke result.

