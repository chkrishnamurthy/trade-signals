# EquityWise — Application Overview

> **Purpose of this document.** A single, self-contained overview of the EquityWise
> application as it exists **today**, written to be read cold by an external AI tool
> or a new engineer with no other context. It reconciles and supersedes the older,
> partially-stale docs scattered under `docs/` (see [§18](#18-caveats--stale-docs)).
> When this file and an older doc disagree about the *current* system, **this file
> and the code win.**
>
> Last reconciled against the codebase: 2026-09-12.

---

## 1. What EquityWise is

EquityWise is a **multi-user web tool for tracking and analysing NSE (National Stock
Exchange of India) equities**. It surfaces technical setups worth attention —
bullish/bearish setups, breakouts, breakdowns, momentum, trend changes, volume
anomalies — as **decision support, not execution**.

It answers three questions and nothing else:

1. **What is happening in the market?**
2. **Which stocks deserve attention right now?**
3. **Why does this stock deserve attention?**

It is deployed publicly with **per-user accounts**: each user signs in and owns their
own watchlists and data. It is multi-**user** (individuals), **not** multi-**tenant**
(no organisations, teams, or shared workspaces).

### What it is NOT

- **Not a broker and not a trading terminal.** It never places, modifies, cancels,
  manages, or represents an order. Orders are placed by hand on a separate platform.
- **Not a Fyers client.** Fyers is only the upstream market-data provider. The UI
  never presents itself as a Fyers product, and business logic never touches a Fyers
  type (see [§9](#9-market-data-provider-boundary-fyers)).
- **Not an investment adviser.** Signals are technical observations, not advice; a
  score is *setup strength*, never a probability of profit. The app is not a SEBI
  research analyst / investment adviser and says so in its disclaimer.

---

## 2. Current scope — **watchlists only**

This is the single most important thing to understand about the current codebase,
because most of the older docs describe a much larger product that no longer exists
in the tree.

**The app has been deliberately stripped down to the watchlists surface
(`/watchlists`) plus the data spine that feeds it.** What remains:

- The **`/watchlists`** page — the one real product surface.
- The **Fyers market-data provider** for live quotes.
- **`/api/search`** to add names to a watchlist.
- The **daily end-of-day pass** (worker) that computes the indicator / return / signal
  columns shown on a watchlist.
- A full **first-party auth system** and account/profile management.
- Public marketing/legal pages (landing, about, methodology, disclaimer, etc.).

**What was removed** (code deleted, not just hidden):

- Pages & APIs: the **dashboard**, **all-stocks / stock detail**, **screener**,
  **sectors**, **intraday-signals**, **signal-performance**, and **backtests**.
- The entire **intraday / backtest / paper-trading engine**
  (`packages/core/src/intraday`, the worker's intraday cycle, the backtest scripts).
  *This code no longer exists in the tree.*
- (Most recently) the public **stocks / screener / sectors** research pages were
  removed and the landing page rewritten to centre on watchlists.

New feature pages are intended to be built on this base later. Where an older design
doc describes the fuller original product, treat it as **historical intent**, not a
description of the running system.

---

## 3. The product's hard rules ("Do not")

These are non-negotiable product constraints (from `CLAUDE.md` / `AGENTS.md`). They
shape what may and may not be built.

- **No order execution of any kind** — no place/modify/cancel order, no order book,
  positions, funds, holdings, or broker portfolio. **Not even read-only.** There is no
  order button, order ticket, or order-shaped affordance anywhere in the UI.
- **BUY / SELL may label a signal's direction, and nothing else.** A direction badge
  reads BUY or SELL because that is the fastest thing to scan. Every other word stays
  technical: "Bullish setup", "Breakout candidate", "Technical entry zone",
  "Invalidation level", "Watch". **Never** "ORDER", "ENTRY PRICE", "position", or
  "quantity". An entry/exit level is a *technical price level* and is labelled as one.
- **No confidence number the factors cannot explain.** Every score renders with its
  component breakdown, or it does not render.
- **Multi-user, not multi-tenant.** User / account / session tables and a **minimal
  `user` vs `admin` role** are in scope. Still **out of scope** until explicitly
  planned: organisation/team multi-tenancy, a full RBAC role system, and
  subscriptions/billing.
- **No admin CRUD UI** — configuration is versioned YAML (`config/*.yaml`), not a
  database-backed admin panel.
- **No Redis, Celery, Kubernetes, or Terraform.** No Python in the app.
- **No third-party indicator library** (`technicalindicators` etc.). The core
  indicators are hand-written for auditability.
- **No floating-point money** (see invariant 3 below).

---

## 4. The eight engineering invariants

Violating any of these is considered a system-breaking bug. They are enforced by a
mix of schema constraints, DB triggers, and convention.

1. **`packages/core` is pure.** Every function takes *data + config* and returns a
   result. No DB, no `Date.now()`, no network, no `process.env`, no module-level
   mutable state. (This is what lets a backtester and the live path run identical code.)
2. **Signals are computed on CLOSED candles only** — never the forming candle. The
   tradeable entry is the *next* candle's open. Any path that lets the engine see a
   price at/after the entry timestamp is lookahead bias.
3. **All prices are INTEGER PAISE everywhere internally.** ₹1,245.50 is `124550`.
   Never float rupees, never a decimal library. Convert to a display string only in
   React, via `formatPaise()` in `packages/shared`.
4. **Store only 1m and 1d candles.** 5m/15m/30m/1h derive via `time_bucket` (origin
   aligned to 09:15 IST); weekly derives from daily. Never persist a derived timeframe.
   *(In the current watchlists-only build only daily candles are actively used — see
   [§7](#7-data-model).)*
5. **Never mutate price history.** Corporate actions are rows with adjustment factors,
   applied on read. No `UPDATE` on candles, ever (enforced by append-only triggers).
6. **All timestamps are `TIMESTAMPTZ` in UTC in the database.** Convert to IST only at
   the presentation boundary. Never store a naive datetime; never use server local time.
7. **Strategy config is immutable and versioned.** Changing a weight mints a new
   `strategy_versions` row; never `UPDATE` an existing version.
8. **Every signal writes its factor breakdown and indicator snapshot.** The
   "Why this signal?" UI reads `signal_factors`; it never recomputes.

---

## 5. Architecture & topology

A **pnpm-workspace TypeScript monorepo**. Two runnable apps and six shared packages;
everything runs on a single self-hosted VPS.

```
apps/
  web/              Next.js (App Router) + Tailwind — the website & JSON API. READS data.
  worker/           Long-running croner scheduler — the ONLY writer of market data.
packages/
  shared/           paise + IST/market-time helpers; formatPaise(). Everything depends on it.
  core/             Pure engines: indicators + daily swing signals. No IO. (invariant 1)
  market-data/      Provider-neutral boundary (MarketDataProvider) everything above consumes.
  db/               Drizzle schema, client, migrations, repositories.
  fyers/             Fyers API v3 client (rate-limiter + circuit breaker live here).
  providers-fyers/  The adapter — the ONLY place Fyers types and ours co-exist.
config/             Versioned YAML: index constituents (indices.yaml).
docs/               Architecture, planning, operations, design-system docs.
scripts/            One-off ops/verification scripts (fyers-login, coverage, verify-adjustment).
tracker/            (separate sub-project; not part of the main web/worker app)
```

### The read/write boundary (important)

- **`apps/worker` is the only process that writes market data** (candles, indicators,
  signals, the Fyers credential). It runs on a schedule.
- **`apps/web` only reads** that data (it does write *user* data — auth, profiles,
  watchlists — via its API routes). The web app never mints a market-data token and
  never ingests candles.

This split is a security and correctness boundary, not an accident. See
[§9](#9-market-data-provider-boundary-fyers).

---

## 6. Tech stack

- **Runtime:** Node (`.nvmrc` pins the version; historically Node 22–24), TypeScript
  `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Package manager:** pnpm workspaces (pnpm 10 via corepack).
- **Web:** Next.js 15 (App Router), React 19, Tailwind CSS v4.
- **Database:** self-hosted **PostgreSQL 17 + TimescaleDB** on the VPS (localhost-only,
  compression enabled). **Neon is retained only as a read-only fallback snapshot.**
- **ORM / migrations:** Drizzle ORM + drizzle-kit.
- **Scheduler:** `croner` inside `apps/worker` (never `pg_cron`).
- **Validation:** Zod at every boundary (especially parsing Fyers responses).
- **Auth hashing:** `@node-rs/argon2` (Argon2id).
- **Testing:** Vitest. **Lint/format:** Biome.
- **Market data:** Fyers API v3.
- **No** Redis, Celery, Kubernetes, Terraform, or Python.

---

## 7. Data model

Drizzle schema lives in `packages/db/src/schema/` (each table must be re-exported from
`schema/index.ts` or migrations silently omit it). Tables by domain:

**Auth & profile** (`schema/auth.ts`) — ordinary mutable rows; the append-only /
integer-paise invariants do **not** apply here:
- `auth_users` — integer PK, `email` (unique, lower-cased), `email_verified_at`
  (null = unverified; verification never blocks login), `role` (`user` | `admin`,
  never set from client input), `status` (`active` | `disabled`), `terms_accepted_at`.
- `user_profiles` — 1:1 with user: `display_name`, `avatar_url` (a path to a file on
  the VPS disk, never image bytes), `bio`, `timezone`, `locale`, `preferences` (jsonb).
- `auth_credentials` — 1:1, holds the **Argon2id** `password_hash` (split out so a hash
  never rides along on a user read) + `password_changed_at` (reset ⇒ logout everywhere).
- `auth_sessions`, `auth_mfa` (TOTP 2FA), `auth_tokens` (email-verify / password-reset),
  `auth_attempts` (lockout / rate-limit), `auth_audit` (security event log).

**Market data & signals** (append-only / integer-paise invariants DO apply):
- `daily_candles` — OHLCV in integer paise, `TIMESTAMPTZ` UTC (TimescaleDB hypertable,
  compressed). *Only daily candles are actively used in the current build.*
- `instruments`, `corporate_actions` (adjustment factors, applied on read),
  `ingestion_runs` (`schema/instruments.ts`).
- `daily_indicators` — precomputed per-instrument indicator snapshot for a session.
- `signals`, `signal_factors` (the factor breakdown behind every signal),
  `strategy_versions` (immutable, versioned).
- `provider_credentials` — the daily Fyers token row (written by the worker, read by web).

**Watchlists** (`schema/watchlists.ts`) — the product surface, fully **per-user**:
- `watchlists` — `owner_id` FK → `auth_users` (cascade). Name unique **per owner**; at
  most one default list per owner (partial unique index); `position` for sidebar order.
- `watchlist_items` — the names in a list.
- `watchlist_layouts` — one row per list: the ordered array of visible column ids +
  sort + filters (UI state, rewritten in place; unknown column ids ignored on read).
- `watchlist_views` — saved views/presets for a list.

---

## 8. The daily data pipeline (worker jobs)

`apps/worker` schedules everything with `croner`, all expressed in **IST**
(`Asia/Kolkata`). Current jobs and cadence (`apps/worker/src/index.ts`):

| Job | Schedule (IST) | What it does |
| --- | --- | --- |
| `refresh-credential` | `07:05` weekdays **+ every startup** | Mint a fresh Fyers token into `provider_credentials`. |
| `ingest-daily` | `16:15` weekdays | Pull the day's daily candles for the universe. |
| `compute-indicators` | `16:45` weekdays | Compute `daily_indicators` (and signals) from closed candles. |
| `ingest-retry` | `18:30` weekdays | Retry any ingestion that failed earlier. |
| `auth-maintenance` | `03:30` daily | Prune expired sessions/tokens, housekeeping. |

Notes:
- A scheduled job that fails logs loudly and **does not** silently swallow the error in
  a way that kills the process; connection failures retry with backoff.
- Run a job once, now, for debugging:
  `pnpm --filter @equitywise/worker dev -- --once <job-name>`
  (e.g. `refresh-credential`, `ingest-daily`, `compute-indicators`, `ingest-retry`).
- The **universe** the pipeline covers is defined in `config/indices.yaml`
  (currently the NIFTY 50 constituents, plus headline index instruments
  NIFTY 50 / BANK NIFTY / FIN NIFTY / INDIA VIX for the header tickers).

---

## 9. Market-data provider boundary (Fyers)

The app is **broker-independent**. All Fyers-specific detail — types, the `NSE:` /
`-EQ` / `-INDEX` symbol formats, resolution codes, error classes, the rate limiter, and
the circuit breaker — is confined to `packages/fyers` and `packages/providers-fyers`.
Nothing in `apps/*`, `packages/core`, or any DTO may import `@equitywise/fyers` or name
a Fyers symbol/resolution/field. Business logic consumes a normalised
`MarketDataProvider` from `packages/market-data`.

### The daily credential lifecycle

Fyers tokens **expire every morning (~07:00 IST)** and Fyers permits **one active
session per account**. This is the part most likely to break.

- The **worker** holds the login factors (`FYERS_ID` + `FYERS_TOTP_SECRET` +
  `FYERS_PIN`, plus `FYERS_APP_ID` / `FYERS_SECRET_KEY`), mints a token at 07:05 IST and
  at startup, and writes it to `provider_credentials`. The **web app only reads** that
  row and never mints anything. This split is the security boundary: what reaches the
  deployed web app is a read-only, same-day-expiring quote token — a deploy compromise
  costs a day of quote access, not the brokerage account.
- **Single-session gotcha:** any *other* Fyers login with the same account (e.g. the
  trading app, or a stray `pnpm fyers:login`) **invalidates the worker's token early.**
- **Self-heal:** when a data pull fails because the token was rejected, the worker
  expires the stored credential so the next run re-mints — at most once per ~10 min, so
  a genuine upstream outage can't cause a login storm.
- **Rate limit / circuit breaker:** a token-bucket limiter throttles outgoing calls; a
  Fyers `429` trips a circuit that blocks upstream for the ban duration. A sustained
  flood of failed calls can escalate to a multi-minute / ~1-hour Fyers account ban —
  **wait it out; retrying extends it.**
- **Force a fresh token now** (no restart needed — worker re-mints next cycle):
  `UPDATE provider_credentials SET expires_at = now() - interval '1 minute' WHERE provider_id='fyers';`
- **Practical rule of thumb:** "no signals / no data in the morning" is almost always
  the expired or invalidated credential, not a bug in the engine.

---

## 10. Authentication & multi-user (as-built)

> The design doc `docs/architecture/auth-system-design.md` recommends **Better Auth**
> and is **superseded** — it does *not* describe what was built. The real system is a
> **bespoke, first-party** implementation. (Clerk, used earlier, was removed on
> 2026-09-05; there is no third-party auth vendor now.)

- **Bespoke email + password auth**, all data in the app's own Postgres. No external
  auth vendor.
- **Password hashing:** Argon2id (`@node-rs/argon2`, OWASP baseline m ≈ 19 MiB, t = 2,
  p = 1), with transparent rehash-on-login when params change.
- **Sessions:** server-side, database-backed, **revocable**. The cookie holds an opaque
  random token; the DB stores it hashed. Cookie is `HttpOnly`, `Secure`, `SameSite=Lax`,
  `__Host-`-prefixed.
- **Route gate:** `apps/web/src/middleware.ts` runs on the Edge runtime and only checks
  for the presence of the session cookie (no DB/crypto there). The authoritative,
  revocable check is `getSessionUser()` in the Node runtime, called by protected pages
  and API routes. **Closed by default**; unauthenticated `/api/*` returns
  `401 {code:"UNAUTHENTICATED"}`, unauthenticated pages redirect to `/login`.
- **Public paths only:** `/` and the marketing/legal pages, the `(auth)` pages, and
  `/api/auth/*` + `/api/search` + `robots.txt` / `sitemap.xml`.
- **Implemented account features:** signup (with Terms acceptance), login with
  **lockout / rate-limit** and no user-enumeration, logout, **email verification**
  (optional — never blocks login), **password reset** by email, **TOTP 2FA** (`auth_mfa`),
  active-session listing/revocation, email change (with confirmation), avatar upload,
  profile editing, and a security **audit log** (`auth_audit`).
- **Roles:** minimal `user` vs `admin` (`role` column, never set from client input).
  Admins can list users and disable abusive accounts (`/api/admin/users`,
  `/admin` page). No broader RBAC.
- **Per-user data isolation:** watchlists (and their items/layouts/views) are scoped by
  `owner_id`; every read/write authorises against the signed-in user.
- Server auth code lives in `apps/web/src/server/auth/*`; the user-facing pages are the
  `apps/web/src/app/(auth)/{login,signup,reset,verify}` route group.

---

## 11. Web app surface

### Pages (`apps/web/src/app/*/page.tsx`)

- **`/`** — public landing page (rewritten to centre on watchlists).
- **`/watchlists`** — the one real product surface (see [§12](#12-the-watchlists-feature)).
- **`(auth)`:** `/login`, `/signup`, `/reset`, `/verify`.
- **Account:** `/profile`, `/account/verify-email`.
- **Admin:** `/admin` (user administration; admin role only).
- **Marketing / legal:** `/about`, `/contact`, `/methodology`, `/data-sources`,
  `/disclaimer`, `/privacy`, `/terms`.

### JSON API (`apps/web/src/app/api/*/route.ts`)

- **Auth:** `/api/auth/{sign-in,sign-up,sign-out,session,verify}`,
  `/api/auth/reset/{request,confirm}`.
- **Account:** `/api/account`, `/api/account/{password,email,email/confirm,verify,sessions}`.
- **Profile:** `/api/profile`, `/api/profile/avatar`, `/api/avatars/[file]`.
- **Watchlists:** `/api/watchlists`, `/api/watchlists/[id]`,
  `/api/watchlists/[id]/{items,layout,views}`, `/api/watchlists/[id]/views/[viewId]`,
  `/api/watchlists/default`, `/api/watchlists/reorder`.
- **Market data (read):** `/api/search` (add names), `/api/history/[symbol]`.
- **Fyers handshake:** `/api/fyers/connect` (+ `/callback` route) — the manual OAuth
  path; normally unused because the worker self-refreshes.
- **Admin:** `/api/admin/users`, `/api/admin/users/[id]`.

API conventions (`docs`/skill `api-boundary`): Zod-validate at the boundary, delegate to
the `apps/web/src/server/*` layer (routes stay thin), return the standard error shape,
and rely on the middleware for auth.

---

## 12. The watchlists feature

The product's single surface today. A user builds one or more **watchlists** of NSE
names; each list renders as a configurable table.

- **Add names** via the header search (`/api/search`, backed by `config/indices.yaml`
  and instruments).
- **Columns** are driven by a column registry; the visible set, order, sort, and
  filters are saved per-list in `watchlist_layouts` (an ordered array of column ids —
  order and visibility are the same fact). **Saved views** live in `watchlist_views`.
- Columns surface the **end-of-day data spine**: latest price/return columns, technical
  **indicator** values, and **signal** state — all computed by the worker's daily pass
  on closed candles, never recomputed in the browser.
- Multiple lists per user, reorderable in the sidebar (`/api/watchlists/reorder`), with
  exactly one **default** list per user.
- Everything is **decision support**: a direction shows as a BUY/SELL badge with its
  factor breakdown; there is no order affordance (see [§3](#3-the-products-hard-rules-do-not)).

---

## 13. Core signal engine

`packages/core` is **pure** (invariant 1) and holds two things:

- **Indicators** (`src/indicators/`, hand-written, each tested against independently
  hand-computed fixtures): **RSI, moving averages (SMA/EMA), MACD, ATR, ADX, ROC,
  VWAP**.
- **Signals** (`src/signals/`): a **daily swing** signal engine (`swing.ts`,
  `engine.ts`) driven by versioned config (`config.ts`). It runs on closed daily
  candles and emits a signal plus the **factor breakdown** that produced its score
  (persisted to `signal_factors`).

The purity rule is what lets the same code run under a backtester and the live worker;
even though the intraday/backtest surface was removed, the discipline remains.

---

## 14. Design system & UI

- **Tailwind CSS v4**, tokens defined once in `apps/web/src/app/globals.css`. **Nothing
  outside `globals.css` may name a raw colour, radius, or shadow** — components consume
  semantic utilities (`bg-surface`, `text-bullish`, `rounded-lg`, `shadow-elevated`).
  A raw `#hex`/`oklch()` in a component is a bug.
- **Theming is class-based:** a toggle writes `.dark` on `<html>` (`lib/theme.ts`); dark
  is a *designed* palette, not an inversion. Both themes must be verified in the running
  app for any visual change.
- **Responsive is mandatory:** every screen must work at mobile and desktop widths.
- **Storybook** is set up for component development (`docs/planning/storybook-plan.md`,
  `docs/design-system/`).
- Navigation is data-driven from `apps/web/src/lib/navigation.ts`; layout primitives
  live in `apps/web/src/components/layout/` (`app-shell`, `sidebar`, `topbar`,
  `public-header`, `public-footer`, `brand`).

---

## 15. SEO

Public pages are built for search visibility (`docs/architecture/seo-architecture.md`):
JSON-LD structured data (`lib/seo/schema.ts`), a generated `sitemap.ts` (static public
pages only — the private app surface is excluded), and `robots.ts` (closed to `/api/`,
`/watchlists`, `/profile`, `/admin`, and the auth pages). The private application
surface is never advertised as crawlable.

---

## 16. Deployment & operations

Full as-built reference: **`docs/operations/deployment.md`**. In short:

- **One Hostinger VPS (Ubuntu 24.04)** runs everything: the Next.js web app, the worker,
  and Postgres. Only **Nginx** (TLS, reverse-proxy `:443 → :3000`) is exposed; Postgres
  listens on localhost only. Fyers is the only required external dependency.
- **Two PM2 processes:** `equitywise-web` (`next start -p 3000`) and
  `equitywise-worker` (the croner scheduler). PM2 + systemd resurrect both on
  crash/reboot.
- **Deploys are automatic:** **merge to `main` → GitHub Actions → `deploy.sh` on the
  VPS** (git reset → `pnpm install` → `db:migrate` → `pnpm build` → `pm2 restart all`).
  A failed build leaves the previous version running. You never SSH in to deploy.
- **Database:** self-hosted **PG 17 + TimescaleDB 2.29**, compression enabled
  (candles ~90% smaller). Both `DATABASE_URL` and `DATABASE_URL_DIRECT` point at
  `localhost:5432`; the pooled/direct split only mattered on the old Neon host.
- **Backups:** nightly `pg_dump -Fc` (keep 14) + Hostinger weekly whole-VPS backups.
  TimescaleDB restores need the `timescaledb_pre_restore()` / `post_restore()` wrapper.
- **Secrets:** repo-root `.env` (gitignored, `chmod 600`, root-owned on the VPS). The
  web app needs only `DATABASE_URL` (+ `FYERS_APP_ID` for live quotes); all
  minting/login factors are **worker-only**.
- **One-minute health check:** `pm2 status` (both online), `systemctl is-active
  postgresql nginx`, `df -h /`, and scan `pm2 logs equitywise-worker`.

---

## 17. Local development

- **Never run the full `pnpm dev` against production data.** It starts the worker, which
  would write to the live DB *and* invalidate the live Fyers token (single-session).
- **Safe web-only setup:** point the Mac's `.env` `DATABASE_URL` at `localhost:15432`, an
  SSH tunnel to the VPS Postgres, then run only the web app:
  ```bash
  ssh -N -L 15432:localhost:5432 krishna@<vps>     # terminal 1, leave running
  pnpm --filter @equitywise/web dev                # terminal 2 → localhost:3000
  ```
  This reads (and, for write features, mutates) the **live** database — take care.
- **Never run `next build` while a `next dev`/`next start` is serving the same
  directory** — it rewrites chunk hashes under the live process and 404s all CSS/JS.
  Stop the server first, `pnpm clean`, then build.
- **Fast checks that need no DB/Fyers:** `pnpm typecheck`, `pnpm lint`, `pnpm test` —
  prefer these to verify most changes.

### Key scripts (root `package.json`)

| Command | Does |
| --- | --- |
| `pnpm dev` | every package in watch mode + `next dev` (⚠ starts the worker) |
| `pnpm dev:web` | web app only |
| `pnpm build` | topological build across the workspace |
| `pnpm test` / `test:coverage` | Vitest (+ v8 coverage) |
| `pnpm lint` / `lint:fix` | Biome check / write |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm db:generate` / `db:migrate` / `db:studio` | drizzle-kit |
| `pnpm fyers:login` | manual token mint into `.env` (fallback path) |
| `pnpm verify:adjustment` | check whether the provider back-adjusts split history |
| `pnpm data:coverage` | data-coverage report |

---

## 18. Conventions & testing

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes`.
- **Zod schemas at every boundary**, especially when parsing Fyers responses.
- **No `any`; no non-null assertions except in tests.**
- Every indicator is tested against **independently hand-computed fixtures** (Vitest).
- Config in `config/*.yaml`; secrets in `.env` (gitignored).
- The DB schema suite runs against a **throwaway Neon branch** (it skips cleanly if
  `NEON_API_KEY` is unset), because it migrates from empty and discards.

---

## 19. Caveats — stale docs

The `docs/` tree accreted over several product phases and some of it describes the older,
larger product or superseded decisions. **When in doubt, trust the code and this file.**
Known stale points to be aware of:

- **`README.md` (root):** still mentions **Clerk**, the **`/signals` intraday engine**,
  **paper trades**, and **Neon as the primary DB** — all removed/superseded. Its Fyers
  refresh time (08:30) is also out of date; the code schedules **07:05**.
- **`docs/architecture/auth-system-design.md`:** marked **SUPERSEDED**; recommends
  **Better Auth**, which was **not** built. The real auth is bespoke (see [§10](#10-authentication--multi-user-as-built)).
- **`docs/operations/deployment.md`:** authoritative for infrastructure, but still names
  **Clerk** as external auth and references an **`intraday-signals.ts`** worker job — both
  gone. Its server/deploy/backup facts remain accurate.
- **`docs/architecture/backtesting-architecture.md`** and much of `docs/planning/*`
  (stock-research-platform, signals-page, market-data-scaling, upstox-provider, etc.)
  describe **intended or removed** functionality, not the running system.
- `CLAUDE.md` / `AGENTS.md` are the most current product-rule references, though their
  "Stack" line still says "Neon" (now a fallback only) and their framing occasionally
  still reads single-user in places the code has already made multi-user.

---

## 20. Where things live (quick map)

| You want… | Look in |
| --- | --- |
| Product rules & invariants | `CLAUDE.md`, `AGENTS.md` |
| Pure indicators / signals | `packages/core/src/{indicators,signals}` |
| DB schema & migrations | `packages/db/src/schema`, `packages/db/src/repositories` |
| Fyers client / rate-limit / breaker | `packages/fyers` |
| Provider adapter (only Fyers↔ours seam) | `packages/providers-fyers`, `packages/market-data` |
| Scheduler & jobs | `apps/worker/src/index.ts`, `apps/worker/src/jobs/*` |
| Web pages & API | `apps/web/src/app/**` |
| Server logic (auth, watchlists, search) | `apps/web/src/server/**` |
| Design tokens / theming | `apps/web/src/app/globals.css`, `docs/design-system/` |
| Universe (NIFTY 50) | `config/indices.yaml` |
| Deploy / ops / credential lifecycle | `docs/operations/deployment.md` |
| Fyers credential mint job | `apps/worker/src/jobs/refresh-credential.ts` |
