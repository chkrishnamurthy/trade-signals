# EquityWise — Application Overview

> **Purpose of this document.** A single, self-contained overview of the EquityWise
> application as it exists **today**, written to be read cold by an external AI tool
> or a new engineer with no other context. When this file and an older doc disagree
> about the *current* system, **the code wins, then `CLAUDE.md`, then this file.**
> Planning docs under `docs/planning/` describe intent; their frontmatter `status:`
> says whether a plan is built, superseded or removed.
>
> Last reconciled against the codebase: 2026-10-18.

---

## 1. What EquityWise is

EquityWise is a **multi-user web tool for tracking, analysing and screening NSE
(National Stock Exchange of India) equities**. It shows what the market and each stock
are doing — trend, breakouts, momentum, volume, delivery, ownership, events — from
data, and lets each user screen and watch on conditions they choose. **It describes;
it never picks stocks.**

It answers three questions and nothing else:

1. **What is happening in the market?**
2. **Which stocks match the conditions I chose** (screener, watchlists, alerts)?
3. **What do the facts say about this stock?**

It is deployed publicly with **per-user accounts**: each user signs in and owns their
own watchlists, screens, alerts and portfolio. It is multi-**user** (individuals),
**not** multi-**tenant** (no organisations, teams, or shared workspaces).

### What it is NOT

- **Not a broker and not a trading terminal.** It never places, modifies, cancels,
  manages, or represents an order, and nothing is ever fetched from a broker account.
- **Not a signal service.** Signals, setups, paper trading and the intraday strategy
  were **removed on 2026-10-17** (`docs/planning/signals-and-paper-removal-plan.md`,
  migration `0046`). The app never labels a stock BUY/SELL or a bullish/bearish
  "setup", never ranks stocks by its own conviction, never names entry/target/stop
  levels, and never simulates trades. Paid recommendations need SEBI Research Analyst
  registration; bringing any of this back is a product decision, not a feature task.
- **Not a Fyers or Dhan client.** Both are upstream market-data providers only. The UI
  never presents itself as either, and business logic never touches a provider type
  (see [§9](#9-market-data-providers)).
- **No fundamentals.** P/E, ROE, market cap and the like need a new data source.

---

## 2. Current scope

Every signed-in user gets the surfaces below. Navigation is data-driven from
`apps/web/src/lib/navigation.ts`.

| Area | Routes | What it is |
| --- | --- | --- |
| Market Brief | `/today` | A technical summary of the latest completed session: the user's own stocks, participation over time, industry leadership and weakness, measured market activity |
| Watchlists | `/watchlists` | Per-user lists with configurable columns, saved views, templates and live quotes |
| Screener | `/screener` | The whole NSE EQ/BE/BZ universe filtered on ~95 nightly metrics; saved screens |
| Stock page | `/stocks/[symbol]` | One stock in full: price chart, per-user ratio board, "What stands out" facts, dividends |
| Breadth | `/markets/breadth` | Advance/decline and participation across the universe |
| Institutional flow | `/flows` | FII/DII cash, bulk/block deals, delivery, participant-wise and stock-futures OI |
| Announcements | `/announcements` | NSE/BSE corporate filings, interpreted into categories by rule |
| Market calendar | `/calendar` | Holidays, results, corporate actions and watchlist events |
| IPOs | `/ipos`, `/ipos/all`, `/ipos/calendar`, `/ipos/listings`, `/ipos/gmp`, `/ipos/pipeline`, `/ipos/[slug]` | Mainboard and SME issues from NSE; RHP sections quoted with pages; SEBI DRHPs listed separately; an **unofficial** GMP from InvestorGain, always labelled |
| Portfolio | `/portfolio`, `/portfolio/[symbol]`, `/portfolio/analysis`, `/portfolio/notices` | The user's own hand-typed or file-imported holdings, valued at the last price; returns, risk, tax lots, statement check, corporate-action notices |
| Alerts | `/alerts` | Price or RSI level crossings, evaluated on a completed session |

**Admin only** (`role = 'admin'`): `/admin` (user administration — disable or change
role), `/admin/logs` (the `event_log` viewer), `/admin/ipos` (IPO pipeline health).

**Public:** the landing page `/`, `/about`, `/methodology`, `/data-sources`,
`/disclaimer`, `/contact`, `/privacy`, `/terms`, and the `(auth)` pages.

`/ipos/mainboard` and `/ipos/sme` redirect to `/ipos/all`. There is no apply button,
rating or opinion on any IPO, and the portfolio never advises.

---

## 3. The product's hard rules ("Do not")

From `CLAUDE.md`, which is authoritative. They shape what may and may not be built.

- **No order execution of any kind** — no place/modify/cancel order, order book, funds,
  or broker portfolio. Holdings the user types in or uploads themselves are allowed.
  There is no order button, ticket, or order-shaped affordance; never "ORDER",
  "ENTRY PRICE", "position" or "quantity".
- **No signals, setups, recommendations or paper trading** (see §1).
- **Portfolio vocabulary:** "Added shares" / "Removed shares" (tax view: "Acquired" /
  "Disposed"), "Number of shares", "Holding", "Average cost". Never "Buy", "Sell",
  "Position", "Quantity", "Order", "Execute", "Rebalance", "Recommended",
  "Underweight", "Overweight".
- **No confidence number the factors cannot explain.** Every score renders with its
  component breakdown, or it does not render.
- **Multi-user, not multi-tenant.** User / account / session tables and a **minimal
  `user` vs `admin` role** are in scope. Out of scope until explicitly planned:
  organisation/team multi-tenancy, a full RBAC role system, subscriptions/billing.
- **No admin CRUD UI** — configuration is versioned YAML (`config/*.yaml`).
- **No Redis, Celery, Kubernetes, or Terraform.** No Python in the app.
- **No third-party indicator library** (`technicalindicators` etc.). The core
  indicators are hand-written for auditability.
- **No floating-point money** (invariant 3 below).

---

## 4. The engineering invariants

Violating any of these is a system-breaking bug. They are enforced by a mix of schema
constraints, DB triggers, tests and convention.

1. **`packages/core` is pure.** Every function takes *data + config* and returns a
   result. No DB, no `Date.now()`, no network, no `process.env`, no module-level
   mutable state — so every calculation is testable against fixed fixtures.
2. **Indicators and screener metrics use CLOSED candles only** — never the forming
   candle. A value stored for a session is computed from that session's closed bars
   and nothing later.
3. **All prices are INTEGER PAISE everywhere internally.** ₹1,245.50 is `124550`.
   Never float rupees, never a decimal library. Convert to a display string only in
   React, via `formatPaise()` in `packages/shared`.
4. **Store only 1m and 1d candles.** 5m/15m/30m/1h derive via `time_bucket` (origin
   aligned to 09:15 IST); weekly derives from daily. Never persist a derived timeframe.
5. **Never mutate price history.** Corporate actions are rows with adjustment factors,
   applied on read. No `UPDATE` on candles, ever (append-only triggers).
6. **All timestamps are `TIMESTAMPTZ` in UTC in the database.** Convert to IST only at
   the presentation boundary. Never store a naive datetime; never use server local time.
7. **Portfolio data is private.** Every query is scoped by `owner_id` in the repository
   layer. Holdings, shares and cost never reach logs, the event log, error reports or
   URLs; no admin screen shows them; account deletion cascades. Uploaded files are
   parsed and discarded — only the rows the user reviewed are stored.

---

## 5. Architecture & topology

A **pnpm-workspace TypeScript monorepo**: two runnable apps and eight packages, all on
one self-hosted VPS.

```
apps/
  web/              Next.js (App Router) + Tailwind — the website & JSON API.
  worker/           Long-running croner scheduler — every job that ingests or computes market data.
packages/
  shared/           paise + IST/market-time helpers; formatPaise(). Everything depends on it.
  core/             Pure calculations (invariant 1): indicators, screener metrics & breadth,
                    IPOs, portfolio, alerts, flows, exchange calendar, announcement interpretation.
  market-data/      Provider-neutral boundary: MarketDataProvider, the routed provider, config.
  db/               Drizzle schema, client, migrations, repositories.
  fyers/            Fyers API v3 client (rate limiter + circuit breaker).
  providers-fyers/  The Fyers adapter — the only place Fyers types and ours co-exist.
  dhan/             Dhan API v2 client.
  providers-dhan/   The Dhan adapter.
config/             Versioned YAML: indices, NSE/market calendars, IPO sources/registrars/RHP
                    overrides, screener presets.
docs/               Architecture, operations, planning, reference, design system (docs/README.md).
scripts/            One-off ops/verification scripts.
test/               Integration-test helpers and the Playwright release smoke (test/e2e).
tracker/            Standalone Markdown work tracker; not part of the workspace.
```

### The read/write boundary (important)

- **`apps/worker` is the only process that writes market data** — candles, indicators,
  screener snapshots, breadth, flows, filings, IPO data, quotes cache, and the provider
  credentials. It runs on a schedule.
- **`apps/web` only reads** that data. It writes *user* data — auth, profiles,
  watchlists, saved screens, ratio layouts, alerts, portfolio entries — through its API
  routes, and never mints a market-data token or ingests candles.

This split is a security and correctness boundary, not an accident (see
[§9](#9-market-data-providers)).

---

## 6. Tech stack

- **Runtime:** Node 24 (`.nvmrc`), TypeScript `strict` (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- **Package manager:** pnpm 10 workspaces.
- **Web:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Storybook 10.
- **Database:** self-hosted **PostgreSQL 17 + TimescaleDB** on the VPS (localhost-only,
  compression enabled). **Neon is retained only as a read-only fallback snapshot.**
- **ORM / migrations:** Drizzle ORM + drizzle-kit (most migrations hand-written SQL).
- **Scheduler:** `croner` inside `apps/worker` (never `pg_cron`).
- **Validation:** Zod at every boundary.
- **Auth:** first-party; `@node-rs/argon2` (Argon2id); Resend for account email.
- **Testing:** Vitest (unit + DB integration), Playwright (release smoke).
  **Lint/format:** Biome.
- **Market data:** Fyers API v3 and Dhan API v2, plus NSE/BSE/SEBI public files.
- **No** Redis, Celery, Kubernetes, Terraform, or Python in the app.

---

## 7. Data model

Drizzle schema lives in `packages/db/src/schema/` (each table must be re-exported from
`schema/index.ts` or migrations silently omit it). Migrations are in
`packages/db/drizzle/` (46 of them, up to `0046`; `meta/_journal.json` lists them). Tables by domain:

**Auth & profile** (`auth.ts`) — ordinary mutable rows; the append-only and paise
invariants do not apply:
`auth_users` (email, `role` user|admin, `status` active|disabled), `user_profiles`,
`auth_credentials` (Argon2id hash, split out so it never rides along on a user read),
`auth_sessions`, `auth_identities` (Google sign-in), `auth_challenges` (short-lived
login/MFA/recent-auth state), `auth_mfa` (TOTP), `auth_tokens` (email verify / reset),
`auth_attempts` (lockout / rate limit), `event_log` (security and operations events).

**Market data** — append-only / paise / UTC invariants apply:
- `candles.ts` — `daily_candles`, `minute_candles` (TimescaleDB hypertables, compressed).
- `instruments.ts` — `instruments`, `corporate_actions` (adjustment factors, applied
  on read), `ingestion_runs`.
- `indicators.ts` — `daily_indicators`. `quotes.ts` — `latest_quotes` (worker cache).
- `screener.ts` — `screener_snapshots` + `screener_snapshot_builds` (one row per stock
  per night), `market_breadth_daily`, `index_memberships`, `instrument_reference`,
  `dividends` (never applied to prices), and the per-user `saved_screens`,
  `user_ratio_layouts`.
- `flows.ts` — `delivery_stats`, `participant_oi`, `derivative_oi_daily`,
  `feed_ingestion_runs`. `disclosures.ts` — `corporate_announcements`,
  `bulk_block_deals`, `fii_dii_flows`, `shareholding_patterns`.
- `announcement-research.ts` — `announcement_versions`, `announcement_user_state`,
  `announcement_ingestion_runs`.
- `ipos.ts` — `ipo_issues`, `ipo_source_records`, `ipo_documents`, `ipo_rhp_extracts`,
  `ipo_subscription_snapshots`, `ipo_gmp_snapshots`, `ipo_listing_performance`,
  `ipo_sebi_filings`.
- `exchange-calendar.ts` — `exchange_sessions`. `market-events.ts` — `market_events`.
- `credentials.ts` — `provider_credentials` (one row per provider; written by the
  worker, read by web). `checkpoints.ts` — `worker_checkpoints`.

**Per-user product data** — every row carries an `owner_id` FK to `auth_users`
(cascade on delete):
- `watchlists.ts` — `watchlists` (name unique per owner, one default per owner),
  `watchlist_items`, `watchlist_layouts` (ordered column ids + sort + filters),
  `watchlist_views`.
- `alerts.ts` — `alerts`, `alert_events` (append-only; fires once per session).
- `portfolio.ts` — `holding_entries`, `holding_notices`, `holding_notice_settings`,
  `portfolio_usage`, plus reference data `amfi_categories` and
  `fair_market_values_2018` (grandfathering for tax).

---

## 8. The data pipeline (worker jobs)

`apps/worker` schedules everything with `croner` in **IST** (`Asia/Kolkata`); the
schedule table is `SCHEDULES` in `apps/worker/src/index.ts`. In-session jobs first ask
the exchange calendar, so a holiday or closure is a logged no-op.

| Area | Jobs (IST, weekdays unless noted) |
| --- | --- |
| Credentials | `refresh-credential` 07:05 + startup · `credential-rollover` 01:35 daily · `probe-credentials` every 5 min in session |
| Candles & indicators | `ingest-daily` 16:15 · `compute-indicators` 16:45 · `ingest-retry` 18:30 · `cross-check-bars` |
| Stock analysis | `reference-universe-sync` 08:30 · `corporate-actions-sync` 08:40 · `stock-analysis-eod` 19:25 & 21:25 (bhavcopy → candles → `screener_snapshots` + breadth) · `build-screener-snapshot` (on demand) |
| Flows & disclosures | `ingest-delivery`, `ingest-participant-oi` 19:10–20:20 · `ingest-futures-oi` 06:45 Tue–Sat · `ingest-fii-dii` 19:45 · `ingest-deals` 18:50 · `ingest-announcements` 4×/day incl. weekends · `ingest-shareholding` Sat + `shareholding-sweep` weekdays |
| IPOs | calendar, details, subscriptions (live + final), listings, GMP (3×/day incl. weekends), SEBI filings, RHP extraction |
| Calendars & indices | `calendar-refresh`, `market-calendar-sync` 06:35 daily · `ingest-index-closes` 19:20 |
| Users | `evaluate-alerts` 17:15 · `portfolio-notices` 19:50 & 21:50 · `refresh-latest-quotes` every 30 min in session · `auth-maintenance` 03:30 daily |
| Reference & backfills | `sync-instrument-metadata` 08:20 · `load-amfi-categories` Mon · `backfill-*` jobs (on demand, or once on start until done) |

Notes:
- The stock-analysis universe is the **whole NSE EQ/BE/BZ list** from the bhavcopy,
  split/bonus-adjusted via `corporate_actions`. `config/indices.yaml` defines the index
  constituents and the headline index tickers.
- A failing job logs loudly and never kills the process; connection failures retry
  with backoff.
- Run a job once, now: `pnpm --filter @equitywise/worker dev -- --once <job-name>`.
  The `dev` script sets `WORKER_MINT_CREDENTIALS=false`, so a local worker never mints.

---

## 9. Market-data providers

The app is **broker-independent**. All provider-specific detail — types, symbol
formats, resolution codes, error classes, rate limiters, circuit breakers — is
confined to `packages/fyers` + `packages/providers-fyers` and `packages/dhan` +
`packages/providers-dhan`. Nothing in `apps/*`, `packages/core`, or any DTO may import
a provider package or name a provider symbol/resolution/field; a boundary test in
`packages/market-data/src/__tests__/` enforces it. Business logic consumes a normalised
`MarketDataProvider` from `packages/market-data`.

`MARKET_DATA_PROVIDER=fyers|dhan|routed` selects the provider in both processes.
`routed` is the intended production shape: daily bars, quotes, instruments and
derivatives from Dhan; intraday bars, market status and the live socket from Fyers;
each falling back to the other on auth/rate-limit/upstream failures. Per-capability
overrides are the `MARKET_DATA_ROUTE_*` variables in `.env.example`. Public NSE, BSE,
SEBI, AMFI and InvestorGain files are read by the worker's `sources/` modules.

### The credential lifecycle

- The **worker** holds the login factors (`FYERS_ID`, `FYERS_TOTP_SECRET`, `FYERS_PIN`;
  `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET`), mints tokens and writes them to
  `provider_credentials`. The **web app only reads** that table. What reaches the web
  app is a read-only, short-lived market-data token — a deploy compromise costs a day
  of quote access, not the brokerage account.
- **Fyers** tokens expire at 07:00 IST; `refresh-credential` mints at 07:05 and at
  startup. **Dhan** tokens last 24 hours from mint; `credential-rollover` renews at
  01:35 so the gap falls in the middle of the night.
- **Single-session gotcha:** Fyers allows one session per account, so any other login
  (the trading app, a stray `pnpm fyers:login`) kills the worker's token early.
- **Self-heal:** `probe-credentials` makes one authenticated call per provider every
  5 minutes in session; a rejected token is re-minted, at most once per 10 minutes, so
  a genuine outage cannot cause a login storm.
- **Rate limits:** a token-bucket limiter throttles outgoing calls; a `429` trips a
  circuit that blocks upstream for the ban duration. Retrying a ban extends it.
- **Force a fresh token now** (the worker re-mints on its next cycle):
  `UPDATE provider_credentials SET expires_at = now() - interval '1 minute' WHERE provider_id='fyers';`
  (or `'dhan'`).
- "No data in the morning" is almost always an expired or invalidated credential.

---

## 10. Authentication & multi-user (as-built)

A **first-party** implementation; all data in the app's own Postgres. Clerk was removed
on 2026-09-05. (`docs/architecture/auth-system-design.md` recommends Better Auth and is
marked superseded; the as-built plan is `docs/planning/authentication-plan.md`.)

- **Sign-in methods:** email + password, and Google (`auth_identities`,
  `AUTH_GOOGLE_ENABLED`; runbook `docs/operations/google-oauth.md`).
- **Password hashing:** Argon2id (`@node-rs/argon2`, m = 19 MiB, t = 2, p = 1) with
  rehash-on-login when parameters change. New passwords pass `validatePassword()`.
- **Sessions:** server-side, database-backed, **revocable**. The cookie carries an
  opaque random token signed with `AUTH_SESSION_SECRET`; the database stores only its
  SHA-256 hash. `HttpOnly`, `SameSite=Lax`, and `__Host-session` (Secure) in production.
  Idle timeout 7 days (rolling), absolute lifetime 30 days.
- **Route gate:** `apps/web/src/middleware.ts` (Edge) refuses cross-site API
  mutations (`403 CSRF_REJECTED`, against `AUTH_TRUSTED_ORIGINS`) and otherwise only
  checks that the session cookie is present. The authoritative check runs in the Node runtime in every
  protected page and API route. **Closed by default:** unauthenticated `/api/*` gets
  `401`, unauthenticated pages redirect to `/login`.
- **Public paths only:** `/`, the marketing/legal pages, the `(auth)` pages,
  `/api/auth/*`, `/api/search`, the OG/Twitter images, `robots.txt` and `sitemap.xml`.
- **Account features:** sign-up with Terms acceptance (`AUTH_ALLOW_SIGNUP`), login
  with lockout / rate limit and no user enumeration, logout, optional email
  verification, password reset by email, TOTP 2FA (secrets encrypted with
  `AUTH_MFA_ENCRYPTION_KEY`), session listing and revocation, email change with
  confirmation, linked identities, avatar upload, profile editing.
- **Roles:** minimal `user` vs `admin`, never set from client input
  (`pnpm tsx scripts/auth-set-role.ts` sets it from a shell). No broader RBAC.
- **Per-user isolation:** every per-user table is scoped by `owner_id` in the
  repository layer, and every route authorises against the signed-in user.
- Server auth code: `apps/web/src/server/auth/*`. Pages:
  `apps/web/src/app/(auth)/{login,signup,reset,verify}`.

---

## 11. Web app surface

Pages are listed in [§2](#2-current-scope). The JSON API lives under
`apps/web/src/app/api/*/route.ts`:

- **Auth:** `/api/auth/{sign-in,sign-up,sign-out,session,verify}`,
  `/api/auth/reset/{request,confirm}`, `/api/auth/google` (+ `/callback`),
  `/api/auth/mfa/verify`.
- **Account & profile:** `/api/account` and `/api/account/{password,email,
  email/confirm,verify,sessions,mfa,identities}`, `/api/profile`,
  `/api/profile/avatar`, `/api/avatars/[file]`.
- **Watchlists:** `/api/watchlists` (+ `/default`, `/reorder`, `/templates`,
  `/from-template`), `/api/watchlists/[id]` and its `items`, `layout`, `views`, `live`.
- **Market data (read):** `/api/search` (+ `/resolve`), `/api/history/[symbol]`,
  `/api/market/indices` (+ `/live`), `/api/market-brief/latest`,
  `/api/market-calendar`, `/api/flows` (+ `/[symbol]`), `/api/announcements`
  (+ `/[id]`), `/api/stocks/ratio-layout`.
- **Screener:** `/api/screener/{run,counts,meta,screens}`, `/api/screener/screens/[id]`.
- **IPOs:** `/api/ipos`, `/api/ipos/[slug]`, `/api/ipos/calendar`,
  `/api/ipos/gmp-track-record`.
- **Portfolio:** `/api/portfolio`, `/entries` (+ `/[id]`), `/import`,
  `/statement-check`, `/realised`, `/tax` (+ `/lots`), `/notices` (+ `/count`,
  `/read`, `/settings`), `/prefs/fifo-note`.
- **Alerts:** `/api/alerts` (+ `/[id]`, `/acknowledge`).
- **Admin:** `/api/admin/users` (+ `/[id]`), `/api/admin/logs`,
  `/api/admin/ipos/health`.
- **Fyers handshake (admin):** `/api/fyers/connect` → `/callback` — the manual OAuth
  path; normally unused because the worker self-refreshes.

Route conventions (skill `api-boundary`): Zod-validate at the boundary, delegate to
`apps/web/src/server/*` (routes stay thin), return the standard error shape, and rely
on the middleware plus the server-side session check for auth.

---

## 12. Core calculations

`packages/core` is **pure** (invariant 1):

- `indicators/` — hand-written, each tested against independently hand-computed
  fixtures: RSI, SMA/EMA, MACD, ATR, ADX, ROC, Bollinger Bands, Stochastic,
  Supertrend, VWAP.
- `screener/` — the metric catalogue (`catalogue.ts`, ~95 technical, delivery, F&O,
  ownership and event metrics), filters, breadth, ratios, corporate-action adjustment,
  dividends and "What stands out" key points.
- `ipos/` — issue resolution across sources, timelines, issue size, GMP handling,
  RHP section extraction.
- `portfolio/` — derivation, returns, benchmark, risk, FIFO tax lots, CSV/statement
  import, reconciliation, notices.
- `alerts/` — alert rule evaluation on a completed session.
- `flows.ts`, `exchange-calendar.ts`, `announcement-interpretation.ts`.

---

## 13. Design system & UI

- **Tailwind CSS v4**, tokens defined once in `apps/web/src/app/globals.css`. **Nothing
  outside `globals.css` may name a raw colour, radius, or shadow** — components use
  semantic utilities. A raw `#hex`/`oklch()` in a component is a bug
  (`docs/design-system/tokens.md`).
- **Theming is class-based:** a toggle writes `.dark` on `<html>` (`lib/theme.ts`); dark
  is a designed palette, not an inversion. Verify both themes for any visual change.
- **Responsive is mandatory:** every screen works at mobile and desktop widths.
- **Loading states** follow `docs/design-system/loading-system.md`.
- **Storybook 10** (`pnpm --filter @equitywise/web storybook`) holds component stories;
  CI builds it.
- Layout primitives live in `apps/web/src/components/layout/` (`app-shell`, `navbar`,
  `nav-menu`, `mobile-nav`, `public-header`, `public-footer`, `brand`); shared
  primitives in `components/ui/`.

---

## 14. SEO

Public pages are built for search (`docs/architecture/seo-architecture.md`): JSON-LD
structured data (`lib/seo/schema.ts`), a generated `sitemap.ts` (public pages only),
OG/Twitter images, and `robots.ts`, which allows the marketing/legal pages and
disallows `/api/`, `/admin`, the app surfaces (`/today`, `/watchlists`, `/flows`,
`/announcements`, `/profile`…) and the auth pages. The private application is never
advertised as crawlable.

---

## 15. Deployment & operations

Full as-built reference: **`docs/operations/deployment.md`**. In short:

- **One Hostinger VPS (Ubuntu 24.04)** runs the web app, the worker and Postgres. Only
  **Nginx** (TLS, `:443 → :3000`) is exposed; Postgres listens on localhost.
- **Two PM2 processes:** `equitywise-web` (`next start -p 3000`) and
  `equitywise-worker` (`node apps/worker/dist/index.js`). PM2 + systemd resurrect both.
- **Deploys are automatic:** merge to `main` → GitHub Actions (`checks`, `db-tests`)
  → `deploy` job runs `deploy.sh` over SSH (pull, install, migrate, build, restart) →
  post-deploy smoke (`scripts/post-deploy-smoke.sh`). A failed build leaves the
  previous version running.
- **Database:** PG 17 + TimescaleDB 2.29, compression on. `DATABASE_URL` and
  `DATABASE_URL_DIRECT` both point at `localhost:5432`.
- **Backups:** nightly `pg_dump -Fc` at 02:30 plus Hostinger whole-VPS backups.
  TimescaleDB restores need the `timescaledb_pre_restore()` / `post_restore()` wrapper.
- **Secrets:** repo-root `.env` (gitignored, `chmod 600`, root-owned on the VPS). Login
  factors are **worker-only**. Every variable is documented in `.env.example`.
- **One-minute health check:** `pm2 status`, `systemctl is-active postgresql nginx`,
  `df -h /`, and `pm2 logs equitywise-worker`.
- Other runbooks: `docs/operations/ipo-pipeline.md`, `google-oauth.md`,
  `security-incident-response.md`.

---

## 16. Local development

- **Never point a local worker at production.** It writes to the live database, and a
  mint kills the live Fyers token. `pnpm --filter @equitywise/worker dev` sets
  `WORKER_MINT_CREDENTIALS=false`; `pnpm dev` starts the worker too.
- **Web-only against the VPS database:** an SSH tunnel to the VPS Postgres, then
  `pnpm dev:web` (details in `docs/operations/deployment.md`). It reads, and for write
  features mutates, **live** data.
- **Local databases:** `pnpm test:db:up` starts a disposable TimescaleDB on port 5433;
  `.claude/launch.json` has web configurations pointed at local databases.
- **Never run `next build` while `next dev`/`next start` serves the same directory** —
  stop the server, `pnpm clean`, then build.
- **Fast checks that need no DB or provider:** `pnpm typecheck`, `pnpm lint`,
  `pnpm test`.

### Key scripts (root `package.json`)

| Command | Does |
| --- | --- |
| `pnpm dev` / `dev:web` | everything in watch mode / the web app only |
| `pnpm build` | topological build across the workspace |
| `pnpm test` / `test:coverage` | Vitest (+ v8 coverage) |
| `pnpm test:integration` | DB suites against a throwaway TimescaleDB container |
| `pnpm test:e2e` | Playwright release smoke |
| `pnpm lint` / `lint:fix` | Biome check / write |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm db:generate` / `db:migrate` / `db:studio` | drizzle-kit |
| `pnpm fyers:login` | manual Fyers token mint into `.env` (fallback) |
| `pnpm dhan:probe` | read-only Dhan API checks |
| `pnpm verify:adjustment` | does the provider back-adjust split history? |
| `pnpm data:coverage` | stored candle history and recent ingestion runs |

---

## 17. Conventions & testing

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Zod schemas at every boundary**, especially provider responses.
- **No `any`; no non-null assertions except in tests.**
- Every indicator is tested against **independently hand-computed fixtures**.
- Config in `config/*.yaml`; secrets in `.env` (gitignored).
- **DB integration suites** run against a local, disposable Postgres 17 + TimescaleDB
  (`docker-compose.test.yml`, `pnpm test:integration`). `test/db.ts` refuses any URL
  that is not local or whose database name does not end in `_test`. Unset locally they
  skip; unset in CI they fail.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, production build, Storybook
  build, Playwright release smoke, then the DB suites; deploy runs only on `main`.

---

## 18. Caveats — older docs

The `docs/` tree accreted over several product phases. **When in doubt, trust the code
and `CLAUDE.md`.**

- `docs/planning/*` carries a frontmatter `status:`. Plans marked `removed` or
  `superseded` (intraday strategy, paper trading, signals pages, Storybook 8, Upstox)
  describe code that no longer exists or was never built.
- `docs/architecture/backtesting-architecture.md` is a proposal that was never
  implemented; backtesting trade strategies is now outside the product.
- `docs/architecture/auth-system-design.md` is superseded (see [§10](#10-authentication--multi-user-as-built)).
- `docs/journal/` and `issues/` are a working log and board; some cards predate the
  2026-10-17 removal.

---

## 19. Where things live (quick map)

| You want… | Look in |
| --- | --- |
| Product rules & invariants | `CLAUDE.md` |
| Status of every feature | `docs/planning/pending-features.md` |
| Pure calculations | `packages/core/src/{indicators,screener,ipos,portfolio,alerts}` |
| DB schema, migrations, queries | `packages/db/src/schema`, `packages/db/drizzle`, `packages/db/src/repositories` |
| Provider clients | `packages/fyers`, `packages/dhan` |
| Provider seam | `packages/providers-fyers`, `packages/providers-dhan`, `packages/market-data` |
| Scheduler & jobs | `apps/worker/src/index.ts`, `apps/worker/src/jobs/*`, `apps/worker/src/sources/*` |
| Web pages & API | `apps/web/src/app/**` |
| Server logic (auth, watchlists, screener…) | `apps/web/src/server/**` |
| Navigation | `apps/web/src/lib/navigation.ts` |
| Design tokens / theming | `apps/web/src/app/globals.css`, `docs/design-system/` |
| Universe & index constituents | NSE bhavcopy (worker), `config/indices.yaml` |
| Deploy / ops / credential lifecycle | `docs/operations/deployment.md` |
| Credential jobs | `apps/worker/src/jobs/refresh-credential.ts`, `credential-self-heal.ts` |
