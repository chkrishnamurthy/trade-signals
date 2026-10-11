---
name: Public launch readiness
status: in-progress-blocked
horizon: next
created: 2026-10-11
updated: 2026-10-11
area: [product, web, worker, operations, qa, docs, marketing]
summary: Phase-gated plan to make EquityWise production-safe, demonstrable, documented, promotable and ready for a controlled public release.
owner: krishna
---

# EquityWise public launch readiness plan

## 1. Purpose and launch standard

This is the execution plan for taking EquityWise from a feature-rich working product to a
publicly releasable product. It covers application readiness, integrations, security, legal and
data-use review, user experience, testing, onboarding, screenshots, generated promotional
images, demo videos, promotion, launch operations and post-launch stabilisation.

The target is not the impossible promise of “zero bugs.” The release standard is:

- no known critical or high-severity defect in a public user journey;
- no unresolved cross-user data-isolation, price/candle correctness or privacy defect;
- every public claim matches a working, user-visible capability;
- every required external integration has been exercised in production or a production-like
  environment, including its failure state;
- deployment is gated by automated verification and has a tested rollback;
- a new user can understand the product and finish the core journey without help;
- demonstrations and promotional assets use a controlled, non-sensitive account and do not
  imply advice, execution, accuracy or returns;
- support, incident response and post-launch monitoring have named owners and procedures.

The hard product rules remain unchanged throughout this plan: closed candles, integer paise,
provider independence, persisted evidence, private portfolio data, no broker portfolio import,
no order execution and no organisation/team multi-tenancy.

## 2. Priority definitions

| Priority | Meaning | Release treatment |
| --- | --- | --- |
| **P0 — launch blocker** | Security, privacy, correctness, legal, deployment, integration or critical-journey risk | Public launch is prohibited until closed or explicitly accepted in writing by the owner |
| **P1 — launch quality** | Required for a trustworthy, understandable and supportable first release | Must close before promotion begins; a narrowly documented exception requires owner approval |
| **P2 — early follow-up** | Valuable improvement that is not required for the first controlled release | Schedule after stabilisation; do not expand launch scope to include it |
| **P3 — future product** | New product capability or broader market expansion | Keep out of the launch critical path |

## 3. Verified baseline — 2026-10-11

### Completed and working

- Public landing, About, Methodology, Data sources, Disclaimer, Terms, Privacy and Contact pages.
- First-party multi-user authentication, Google sign-in, verification, reset, sessions, optional
  TOTP, account deletion and minimal user/admin roles.
- Per-user watchlists, notes, layouts, saved views, starter lists, filters and live-price updates.
- Market Brief, NSE screener, stock research, alerts, portfolio, announcements, calendar,
  institutional flows and IPO research.
- Admin-only intraday strategy research, paper simulation and operator pages.
- Worker scheduling, ingestion tracking, provider credential refresh, provider fallback, event
  log and operational runbooks.
- Financial correctness foundations: integer paise, closed-candle engines, immutable price
  history, stored factor evidence and provider-boundary tests.
- Current local checks: production build, workspace typecheck and Storybook build pass; the full
  PostgreSQL 17 + TimescaleDB run passes 178 files / 2,061 tests with no skips.
- CI has a real Postgres 17 + TimescaleDB service for migrations and repository tests.
- Browser release smoke passes 5/5 locally, and the public post-deploy smoke passes against the
  live domain.

### Partially complete

| Area | Current state | Gap to close | Priority |
| --- | --- | --- | --- |
| Release pipeline | One workflow now gates deploy on app and DB jobs, builds production/Storybook and runs browser/post-deploy smoke | Forced VPS deploy script and exact-SHA contract need operations-key verification; branch protection is absent | P0 |
| Integration verification | Full real-DB suite passes with auth tests required | Production-like copy/rollback restore still needs VPS evidence | P0 |
| Repository hygiene | Current `main` excludes generated Expo files; native mobile is explicitly future scope | User-owned staged Expo files remain preserved locally and are excluded from launch evidence | P0 |
| Production verification | Public smoke/TLS and read-only authenticated baseline are dated | Provider is unavailable; backup restore, processes, disk, Nginx/SSE, email and server deploy script need evidence | P0 |
| Legal and privacy | Substantive public pages exist | No lawyer review; grievance name/address are null; public response commitments need confirmation | P0 |
| Data-use rights | Sources and attribution are documented | Public/promotional redistribution and BSE/NSE/provider usage need owner/legal confirmation | P0 |
| Security | Strong sessions/CSRF/rate limits exist; reset enumeration, proxy IP handling and auth-email logging were hardened | Production admin MFA is off; avatar migration and live secret/log review remain | P0 |
| Data freshness | Several pages show provenance/freshness and watchlist work is in progress | Treatment is not proven across every market-data surface and outage mode | P1 |
| Responsive UX | Responsive navigation and many mobile fixes are built | No browser/device regression gate; touch drag and real-device paths remain unverified | P1 |
| Accessibility | Focus, contrast, reduced motion and Storybook a11y work exist | Storybook interaction/a11y execution is not a CI gate; full keyboard/screen-reader pass is absent | P1 |
| Portfolio imports | CSV, Excel, CAS and contract-note parsing exist | Representative redacted real files are still required | P1 |
| Documentation | Deep architecture and planning documentation exists | Beginner guide is absent; root README and several plans contain stale historical statements | P1 |
| Onboarding | Landing has a three-step explanation and starter-list concepts exist | No end-to-end first-run walkthrough or measured empty-state journey | P1 |
| Demo readiness | Storybook fixtures and landing previews exist | No dedicated demo user, reset procedure, screenshot set, video script or final recordings | P1 |
| Promotion | Landing metadata, social image and public trust pages exist | No launch content calendar, media kit, feature clips or approved screenshot library | P1 |
| Support | Support and compliance addresses are declared | Inbox deliverability, response workflow, triage template and public status process are unverified | P1 |

### Missing before a proper public launch

- Protected `main`, verified exact-SHA server deployment and a green clean-checkout release candidate.
- Rehearsed application rollback and database recovery using forward-compatible migrations.
- A production readiness evidence pack covering auth, email, providers, worker freshness,
  migrations, backups, restore, TLS, proxy headers, logs, alerts and rollback.
- Legal review, grievance officer details and confirmed data-use/marketing rights.
- A repeatable, non-sensitive demo account and dataset.
- A beginner user guide and a first-run journey that can be completed without assistance.
- Approved screenshots, promotional image variants, demo scripts, recorded demo videos,
  captions, thumbnails and alt text.
- Launch support, incident triage, owner/on-call responsibilities and stop/rollback criteria.
- A controlled beta with documented feedback and defect resolution.

### Explicitly not required for the first launch

Do not delay the release for fundamentals, an options chain, per-user index selection, a NIFTY
constituent page, additional alert channels, public signal-performance claims, a native mobile app,
subscriptions or organisation/team features. These are P2/P3 work and require separate decisions.

## 4. Launch scope and golden journey

### Launch product promise

> After each NSE close, EquityWise helps self-directed Indian investors understand what changed,
> find stocks matching conditions they understand, and inspect the evidence behind each result —
> without broker access, tips or order execution.

### Primary audiences

1. Busy investors who hold a few stocks and cannot watch the market continuously.
2. Evidence-oriented users who screen NSE stocks using explicit conditions.
3. IPO followers who want source-linked issue information.
4. Newer investors who benefit from plain-language explanations and visible methodology.

### Golden user journey

The release candidate must prove this sequence on desktop and phone widths:

1. Visit the landing page and understand what the product is and is not.
2. Create an account, verify email or use Google, and sign in.
3. Open the Market Brief and understand the latest completed session.
4. Run a starter screen, inspect results and open one stock page.
5. Understand “what stands out” and open the evidence behind it.
6. Add the stock to a watchlist and optionally add a private note.
7. Create a closing-price or RSI alert.
8. Optionally add a portfolio entry or import a safe sample file.
9. Find methodology, data sources, privacy controls and account deletion.
10. Sign out and sign back in without losing user-owned state.

## 5. Prioritised readiness roadmap

| Order | Phase | Priority | Objective | Depends on | Exit outcome |
| --- | --- | --- | --- | --- | --- |
| 0 | Scope freeze and launch control | P0 | Establish one release target, tracker and evidence standard | None | Approved launch scope and clean work boundary |
| 1 | Release engineering and repository health | P0 | Make every production deploy reproducible and CI-gated | Phase 0 | Clean release candidate; failed checks cannot deploy |
| 2 | Security, privacy, legal and data rights | P0 | Make the public service and claims defensible | Phase 0 | Written sign-offs and no unresolved high-risk finding |
| 3 | Integration, data and production operations | P0 | Prove every external dependency and failure mode | Phases 1–2 partly parallel | Production readiness evidence pack |
| 4 | Product completion, UX and browser QA | P0/P1 | Remove critical journey defects and make all states understandable | Phases 1 and 3 | Golden journey passes on supported devices |
| 5 | Onboarding, user guide and support | P1 | Make the product self-explanatory and supportable | Phase 4 stable IA/copy | Beginner guide and complete first-run path |
| 6 | Demo system, screenshots and generated images | P1 | Produce safe, repeatable visual assets from the release candidate | Phases 4–5 | Approved image library and demo account |
| 7 | Demo video and promotional package | P1 | Explain and promote the verified product accurately | Phase 6 | Final video set, landing assets and campaign kit |
| 8 | Controlled beta and launch rehearsal | P0/P1 | Validate the product with real users and rehearse operations | Phases 1–7 | Beta sign-off and successful rehearsal |
| 9 | Public release | P0/P1 | Open access gradually with monitoring and rollback control | Phase 8 | Stable public release and incident readiness |
| 10 | Stabilisation and post-launch roadmap | P2/P3 | Resolve real usage issues before expanding scope | Phase 9 | Stable service and evidence-based next roadmap |

## 6. Phase-by-phase execution plan

### Phase 0 — Scope freeze and launch control

**Priority:** P0  
**Objective:** prevent launch preparation from being diluted by new features.

#### Tasks

- Decide that the first release is the responsive web application; classify `apps/mobile` as
  either a separately tracked future app or remove generated scaffolding from the release scope.
- Freeze P2/P3 product development until the beta exit gate.
- Create one launch board using the phase and task headings in this document.
- Record a named owner, reviewer, status, evidence link and target phase for every P0/P1 item.
- Define supported browsers and minimum viewport/device matrix.
- Define severity: Critical, High, Medium, Low, including response and launch-blocking rules.
- Capture a baseline of the current production deployment, worker health and known issues.
- Protect all current uncommitted work; decide what belongs in the release candidate before
  starting launch fixes.

#### Deliverables

- Launch scope statement.
- P0/P1 tracker.
- Supported-platform matrix.
- Baseline issue register and risk register.

#### Exit gate

- Every open item is classified; no ambiguous mobile/new-feature work is on the release path.
- Owner approves the product promise, golden journey and no-go rules.

### Phase 1 — Release engineering and repository health

**Priority:** P0  
**Objective:** ensure only a fully verified commit can reach production.

#### Tasks

- Resolve generated Expo files so `pnpm lint:app` passes from a clean checkout.
- Add the Next.js production build to CI.
- Keep typecheck, lint, Storybook build, unit tests and DB tests as required checks.
- Add a small browser smoke/E2E job for public landing, auth redirect and the signed-in golden path.
- Make deployment depend on successful CI for the exact commit. Do not deploy in parallel with
  uncompleted verification.
- Review migration ordering: a failed application build must not leave production on an
  incompatible migrated schema.
- Add a post-deploy smoke check and automatic failure signal.
- Document rollback for application and forward-compatible database migrations; rehearse it.
- Enable protected-branch requirements for the release checks.
- Produce one versioned release checklist and release-note template.

#### Required automated gate

```text
install --frozen-lockfile
  → lint
  → typecheck
  → production build
  → unit tests
  → Postgres/TimescaleDB migrations + DB tests
  → Storybook build + interaction/a11y tests where supported
  → browser smoke tests
  → deploy
  → post-deploy smoke
```

#### Exit gate

- A clean checkout passes every required check.
- An intentionally failing check demonstrably prevents deployment.
- Rollback and post-deploy smoke procedures have been exercised.

### Phase 2 — Security, privacy, legal and data rights

**Priority:** P0  
**Objective:** make the application trustworthy and the public claims legally supportable.

#### Tasks

- Fill the real grievance officer name and postal address.
- Confirm or revise the stated acknowledgement and resolution windows.
- Obtain professional review of Terms, Privacy, Disclaimer and Contact/grievance wording.
- Confirm the manual “request a copy of my data” procedure and its responsible owner.
- Verify account deletion cascades and document the backup-retention exception accurately.
- Confirm NSE, BSE, Fyers, Dhan, InvestorGain, SEBI filing and RHP use/attribution rights for:
  signed-in display, public marketing screenshots, recorded video and future public pages.
- Decide whether the BSE undocumented interface remains enabled; preserve its kill switch.
- Review Content Security Policy, `X-Forwarded-For`, HSTS/security headers, cookie flags,
  trusted origins, OAuth redirects and production secret placement.
- Require TOTP for admin users or record a formal risk acceptance and compensating control.
- Exercise cross-user isolation for watchlists, saved screens, alerts, portfolio and profile data.
- Confirm no portfolio details appear in application logs, analytics, error reports or URLs.
- Review upload size/type limits, avatar persistence and malicious-file handling.
- Document vulnerability/incident reporting and secret-rotation procedures.

#### Deliverables

- Legal review record and approved copy.
- Data-source rights matrix with permitted uses and required attribution.
- Security review checklist and remediation log.
- Admin access policy and incident procedure.

#### Exit gate

- No open Critical/High legal, isolation, authentication, privacy or data-rights issue.
- Every marketing claim and screenshot use is covered by the rights matrix.

### Phase 3 — Integration, data and production operations

**Priority:** P0  
**Objective:** prove that the live system stays accurate, fresh and recoverable.

#### Tasks

- Run the full integration suite on the release candidate using PostgreSQL 17 + TimescaleDB.
- Apply all migrations to a fresh database and to a production-like copy.
- Confirm production provider selection and per-route fallback; do not rely on `.env.example`.
- Verify Fyers and Dhan credential minting, expiry, self-heal, rate limits and kill switches.
- Verify Resend domain, sender, verification, password-reset, security and alert email delivery.
- Verify Google OAuth using exact production redirect URIs.
- Verify daily candles, screener snapshots, indicators, flows, announcements, corporate actions,
  IPOs, alerts, quotes and calendar jobs with expected freshness windows.
- Turn ingestion-run enforcement on only after a documented healthy observation period.
- Test provider rejection, rate limiting, worker downtime, missing candles, stale quotes and email
  failure; every public surface must show an honest state rather than invented or old-as-live data.
- Run IPO endpoint checks from the VPS, perform the planned backfill and observe feed health.
- Confirm Nginx SSE buffering/timeouts for live watchlists.
- Verify event-log visibility, retention decision and redaction.
- Verify nightly backups, off-server copy, restore drill and measured recovery time.
- Add a minimal public liveness endpoint and a private readiness/worker-health view if the current
  operator pages cannot support automated smoke checks without exposing sensitive detail.
- Verify disk, certificate, database and process alerts plus the operator response path.

#### Deliverables

- Dated production readiness report with screenshots/log excerpts free of secrets.
- Data freshness matrix: dataset, expected update time, source, stale threshold, UI behavior.
- Backup/restore evidence and recovery record.
- Integration failure-mode matrix.

#### Exit gate

- All integrations pass their success and failure scenarios.
- No page presents stale or unavailable data as current.
- Backup restore and rollback are proven, not merely documented.

### Phase 4 — Product completion, UX and browser QA

**Priority:** P0/P1  
**Objective:** make the golden journey reliable, understandable and polished.

#### Critical journeys to automate

- Sign up → verification → login → logout → login again.
- Google login and password-account login.
- Password reset, session revocation and optional/required MFA.
- Create/edit/delete/reorder a watchlist; add note; save layout/view; receive live/fallback price.
- Run and save a screen; open a stock; add it to a watchlist.
- Read Market Brief, flows, announcements, calendar and IPO pages.
- Create/toggle/delete an alert; worker evaluates it; event and email are recorded once.
- Add/edit/remove a portfolio entry; import approved file formats; view analysis; export data.
- Verify user A cannot read or mutate user B data through UI or API.
- Delete an account and verify cascades and session invalidation.
- Admin-only pages and APIs refuse normal users.

#### UX and quality tasks

- Audit every page for loading, empty, error, permission, stale and partial-data states.
- Extend consistent freshness/unavailable treatment to all required surfaces.
- Test Chrome, Safari and Edge at agreed desktop, tablet and 375/390px phone sizes.
- Verify touch, mouse and keyboard paths, including watchlist reorder and overlays.
- Run keyboard-only, screen-reader landmarks/names, contrast, reduced-motion and zoom checks.
- Execute Storybook interaction/a11y checks in CI or add equivalent component tests.
- Test representative long names, large values, zero data, negative values and missing fields.
- Test slow network, disconnected network, expired session and provider outage behavior.
- Use redacted real broker files for CSV, Excel, CAS and contract-note imports.
- Review performance: landing load, authenticated first load, large watchlist, screener response,
  stock page and live SSE resource use.
- Fix all Critical/High findings; triage every Medium finding with an owner and decision.

#### Exit gate

- Golden journey passes automatically and manually on the supported matrix.
- No known Critical/High defect; no unexplained console error or horizontal body overflow.
- Accessibility and performance budgets are recorded and met.

### Phase 5 — Onboarding, user guide and support

**Priority:** P1  
**Objective:** let a beginner succeed without a guided call.

#### Tasks

- Write a public “Getting started” guide using the exact current UI labels.
- Cover: account setup, Market Brief, watchlists, screener, stock evidence, alerts, portfolio,
  IPO/calendar/flows, data freshness, limitations, privacy and account deletion.
- Add concise first-run empty states with a single useful next action.
- Offer starter watchlists/screens and safe sample portfolio data where appropriate.
- Add contextual links to Methodology and Data sources near concepts that need explanation.
- Create a glossary for RSI, moving averages, delivery, OI, market breadth and timestamps.
- Verify support and compliance inbox delivery and replies.
- Define support categories, severity, acknowledgement template, troubleshooting questions and
  escalation path.
- Refresh the root README, docs indexes and stale status ledgers so contributors and operators
  follow the as-built product.
- Run a five-person comprehension/usability check; observe rather than coach.

#### Exit gate

- A first-time test user completes the golden journey without developer assistance.
- User guide screenshots and labels match the release candidate.
- Support request, reply and escalation paths have been exercised.

### Phase 6 — Demo system, screenshots and generated images

**Priority:** P1  
**Objective:** create a repeatable visual demonstration without exposing real user data.

#### Demo account and data

- Create a dedicated demo user with no production customer data.
- Use a representative watchlist, saved screen, alert history and fictional or clearly labelled
  sample portfolio values.
- Select a completed market session whose screens are visually informative and legally usable.
- Freeze or document the data date; never present old data as live.
- Provide a reset script/checklist so the demo starts in the same state every time.
- Disable or hide notifications, emails and personally identifying browser content during capture.

#### Required screenshot library

Capture approved desktop and phone variants of:

1. Landing hero and “See it before you sign up” tour.
2. Market Brief with breadth and watchlist relevance.
3. Screener with understandable active conditions and useful results.
4. Stock page with “what stands out” and evidence.
5. Watchlist with configurable columns and visible freshness state.
6. Alert creation and a fired-alert example.
7. Portfolio overview and one analysis view using demo data.
8. IPO detail with source attribution.
9. Calendar or institutional-flow view.
10. Mobile navigation plus one data-dense mobile screen.

For each image produce: raw capture, cropped 16:9, 4:5, 1:1 and mobile-story variant, alt text,
caption, source/data-date note and approval status.

#### Generated promotional images

AI-generated visuals may support—not replace—real product screenshots. Create:

- launch hero/background illustration using the EquityWise palette;
- social announcement backgrounds with safe space for copy;
- video thumbnail variants;
- abstract NSE research/data imagery with no fake chart performance;
- optional device-frame composites built from approved real screenshots.

Generated visuals must not contain invented application UI, fake testimonials, broker branding,
guaranteed-return imagery, BUY/SELL instructions or fabricated market results.

#### Exit gate

- Screenshot library is consistent, redacted, dated, responsive and approved.
- Generated images follow the brand and compliance rules.
- Another operator can reset and run the demo from the written procedure.

### Phase 7 — Demo video and promotional package

**Priority:** P1  
**Objective:** explain the verified product clearly and accurately.

#### Main product video — 2 to 3 minutes

| Segment | Purpose | Screen |
| --- | --- | --- |
| 0:00–0:15 | The problem: too much market data, too little explanation | Brand + brief market montage |
| 0:15–0:35 | What happened in the latest completed session | Market Brief |
| 0:35–0:55 | Find stocks using conditions the viewer understands | Screener |
| 0:55–1:20 | Inspect why one result stands out | Stock page + evidence |
| 1:20–1:40 | Keep track without watching continuously | Watchlist + alert |
| 1:40–2:00 | Add personal context without linking a broker | Portfolio |
| 2:00–2:15 | Source-linked breadth of research | IPO/calendar/flows |
| 2:15–2:30 | Trust close and CTA | No tips, no orders, user stays in control |

#### Additional video assets

- 30–45 second product overview.
- Three 20–30 second vertical clips: Market Brief, screener-to-stock, watchlist/alerts.
- Silent captioned loop for landing/social use.
- Full walkthrough/tutorial, approximately 6–10 minutes.
- Thumbnail, subtitles, transcript, chapter markers, alt description and compressed web version.

#### Promotional package

- Updated landing page using only verified claims and approved visuals.
- Feature one-pagers: Market Brief, screener, stock evidence, watchlists/alerts, portfolio, IPOs.
- Launch announcement, founder note, FAQ and press/media summary.
- Social content calendar with educational, feature and trust/source posts.
- Reusable 1:1, 4:5, 16:9 and 9:16 graphic templates.
- Email announcement and onboarding sequence, only for users who may legally receive it.
- UTM/link naming and privacy-compatible aggregate measurement plan; update Privacy before adding
  any analytics not already disclosed.

#### Messaging guardrails

- Lead with clarity, evidence, time saved and user control.
- Do not claim accuracy, profitability, expected returns, guaranteed alerts or superior outcomes.
- Do not promote admin-only signals or paper results as public capabilities.
- Do not call individual-security technical analysis “education.”
- Keep “not a broker, no order execution, not investment advice” visible but not alarmist.

#### Exit gate

- Every spoken and written claim maps to a verified release-candidate screen.
- Captions, mobile playback, audio clarity and legal/data-source credits are approved.

### Phase 8 — Controlled beta and launch rehearsal

**Priority:** P0/P1  
**Objective:** find real-world gaps before public promotion.

#### Tasks

- Invite a small, diverse beta group using a controlled sign-up policy.
- Give no live coaching until each user attempts the beginner guide and golden journey.
- Collect structured feedback: comprehension, trust, usefulness, failures, missing states and
  willingness to return—not investment outcomes.
- Measure activation milestones without logging portfolio content.
- Triage every beta issue by severity and root cause; fix all Critical/High items.
- Run a market-open and after-close observation day to cover both live and completed-session modes.
- Rehearse launch day: deployment, smoke checks, demo, support reply, provider outage, worker
  failure, rollback and public status message.
- Freeze the release candidate after rehearsal; only approved blocker fixes may enter.

#### Exit gate

- Beta users can complete the golden journey and accurately describe the product.
- No open Critical/High beta issue and no unresolved data-isolation concern.
- Launch rehearsal, rollback and incident communication all succeed.

### Phase 9 — Public release

**Priority:** P0/P1  
**Objective:** open access gradually and reversibly.

#### Launch sequence

1. Confirm legal/security/data-rights sign-offs and release commit.
2. Confirm backup, rollback target, provider credentials, worker schedule and email delivery.
3. Deploy the exact green commit; run automated and manual smoke tests.
4. Open sign-up to a limited cohort or time window first.
5. Observe errors, latency, worker/data freshness, email delivery and support volume.
6. Expand access only when the initial window is stable.
7. Publish the landing update, main video, launch post and approved social assets.
8. Keep one operator available for the launch observation window.

#### Stop/rollback conditions

- Any cross-user data exposure or portfolio privacy concern.
- Wrong price units, forming-candle use, missing persisted evidence or incorrect corporate-action
  adjustment.
- Repeated authentication/session failure or account-deletion failure.
- Uncontrolled provider request volume, data presented as current when stale, or widespread 5xx.
- Failed migration, unrecoverable worker outage, email abuse or materially incorrect public claim.

#### Exit gate

- Public sign-up and the golden journey remain stable through the agreed observation window.
- No Critical/High incident; support requests are within the promised response window.

### Phase 10 — Stabilisation and post-launch roadmap

**Priority:** P2/P3  
**Objective:** learn from actual use before expanding the product.

#### First stabilisation cycle

- Review incidents, support themes, failed searches, abandoned onboarding and performance.
- Fix reliability and comprehension problems before adding new capabilities.
- Re-run backup restore and security reviews on the agreed cadence.
- Refresh screenshots/tutorials whenever labels or navigation materially change.
- Publish a small change log and known-issues page.

#### Candidate later roadmap

- Fundamentals source and company-research expansion.
- Additional alert rules and push delivery.
- Per-user index selection and NIFTY constituent pages.
- Options-chain research if source/licence and product value are proven.
- Native mobile app as a separate product plan with its own release gates.
- Public end-of-day research pages only after redistribution and SEO decisions are signed off.

## 7. Release test matrix

| Layer | Required coverage |
| --- | --- |
| Pure/unit | Indicators, signal logic, portfolio math, tax, alert crossing, import parsing, formatting |
| Database | All migrations; append-only guards; uniqueness; RLS/owner scoping; cascades; event history |
| API/security | Zod validation, authentication, role checks, CSRF, rate limits, IDOR/isolation, error shape |
| Worker | Schedules, overlap prevention, closed-session gating, retry/backoff, idempotency, shutdown |
| Provider | Normalisation, auth expiry, rate limits, fallback, partial responses, stale/unavailable state |
| Browser E2E | Golden journey, auth recovery, watchlists, screens, alerts, portfolio, account deletion |
| Accessibility | Keyboard, focus, labels/names, landmarks, contrast, zoom, reduced motion, screen reader |
| Responsive | 375/390px phone, tablet, desktop; Chrome, Safari, Edge; light/dark |
| Performance | Landing, signed-in first load, large watchlist, screener, stock page, SSE connections |
| Operations | Deploy gating, migrations, post-deploy smoke, rollback, backup restore, log redaction |
| Content/compliance | Claim-to-feature map, source attribution, dates/freshness, disclaimers, privacy accuracy |

## 8. Master public-release checklist

Public launch is allowed only when every required box is checked or has a written owner-approved
risk acceptance.

### P0

- [x] Release scope frozen and mobile status decided.
- [ ] Clean checkout passes lint, typecheck, production build and Storybook build.
- [x] Full unit and Postgres/TimescaleDB integration suites pass locally (2,061 tests).
- [x] Public/auth/header browser smoke passes locally (5/5); full golden journey remains Phase 4.
- [ ] Deployment waits for the exact commit's required checks (workflow code complete; remote script unverified).
- [ ] Post-deploy smoke and rollback are proven.
- [ ] Cross-user isolation and admin authorization are verified.
- [ ] Legal pages, grievance details and response commitments are approved.
- [ ] Data-use and promotional rights are confirmed.
- [ ] Production auth, Google, Resend and alert email flows pass.
- [ ] Providers, worker jobs, freshness, outage states and rate-limit behavior pass.
- [ ] Backup restore, proxy/security headers, TLS and secret handling pass.
- [ ] No Critical/High defect remains.

### P1

- [ ] Golden journey passes on supported desktop and phone environments.
- [ ] Loading, empty, error, partial and stale states are complete.
- [ ] Accessibility and responsive checks pass.
- [ ] Representative redacted real import files pass.
- [ ] Beginner guide and first-run experience are complete.
- [ ] Support inbox, triage and escalation are tested.
- [ ] Demo account and reset procedure are complete.
- [ ] Screenshot and generated-image library is approved.
- [ ] Main demo, short clips, tutorial, captions and transcripts are approved.
- [ ] Landing and promotional copy use only verified claims.
- [ ] Controlled beta and launch rehearsal pass.

## 9. How to drive this plan

Use the phases in order. Phases 2 and 3 may run partly in parallel after Phase 0, but visual asset
capture must wait for the Phase 4 release-candidate UI, and public promotion must wait for legal,
data-rights and beta approval.

For every task record:

```text
ID · phase · priority · owner · reviewer · status · dependency
acceptance criteria · evidence link · defect/risk links · completion date
```

At each phase review:

1. Demonstrate the deliverable.
2. Run the phase's automated and manual checks.
3. Record evidence and unresolved risks.
4. Approve or reject the exit gate.
5. Start the next phase only after approval.

Phase 0 is complete. The immediate work is the blocked remainder of Phases 1–3 recorded in
`public-launch-tracker.md`: source licences, provider recovery, admin MFA, branch protection and
VPS deploy/backup/restore evidence. Do not begin final screenshots or video recording until those
gates and the Phase 4 golden journey are stable.
