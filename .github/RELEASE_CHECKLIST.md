# EquityWise release checklist

Complete this checklist for the exact release commit. Link evidence in the release issue or pull
request; a checked box without evidence is not a release decision.

## Identity and scope

- [ ] Release commit SHA recorded: `________________________`
- [ ] Release uses `main`; `feat/mobile-app` and `feat/multi-exchange-bse` are excluded.
- [ ] Release owner and observation-window operator are named.
- [ ] No unapproved P2/P3 feature entered the release candidate.

## Required gates

- [ ] GitHub `checks` job passed for the release SHA.
- [ ] GitHub `db-tests` job passed for the release SHA with no DB/auth skips.
- [ ] Production build, Storybook build and browser smoke passed.
- [ ] No open Critical or High defect.
- [ ] Database migrations are forward-compatible with the currently running application.
- [ ] A rollback commit and database recovery decision are recorded.

## Security, privacy and rights

- [ ] Admin MFA policy is satisfied.
- [ ] Cross-user isolation and admin authorization evidence is current.
- [ ] Legal copy, grievance details and response windows have approved sign-off.
- [ ] Every enabled data source has written permission for the intended public use.
- [ ] Promotional screenshots/video use only sources approved for marketing reproduction.
- [ ] Production secrets, trusted origins, OAuth redirects and email sender are verified.

## Production readiness

- [ ] Latest backup completed and an off-server copy exists.
- [ ] Restore drill date, duration and result are recorded.
- [ ] Web and worker processes are healthy; disk and database capacity are within thresholds.
- [ ] Provider credentials and freshness jobs are healthy.
- [ ] TLS, Nginx proxy/SSE behavior and security headers pass.
- [ ] Google sign-in, verification/reset email and alert email delivery pass.
- [ ] Post-deploy smoke succeeds at `https://equitywise.io`.

## Launch decision

- [ ] Release notes contain only verified user-visible claims.
- [ ] Support and incident owners are available for the observation window.
- [ ] Stop/rollback conditions were reviewed.
- [ ] Owner records **GO** or **NO-GO**, timestamp and rationale.

