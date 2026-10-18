# EquityWise

Tracking, analysis and screening for NSE equities. It shows what the market and
each stock are doing — trend, breakouts, momentum, volume, delivery, ownership,
events — from data, and lets each user screen and watch on conditions they choose.
It describes; it never picks stocks, issues buy/sell signals, simulates trades, or
places, manages or represents an order. See [CLAUDE.md](CLAUDE.md) for the hard
rules that govern everything added on top, and [OVERVIEW.md](OVERVIEW.md) for a
cold-read tour of the whole system.

## Layout

```
apps/
  web/              Next.js App Router + Tailwind — pages and the JSON API
  worker/           croner scheduler — every job that ingests or computes market data
packages/
  shared/           paise + IST/market-time helpers — everything depends on this
  core/             pure calculations: indicators, screener metrics, IPOs, portfolio,
                    alerts, flows, exchange calendar, announcement interpretation
  market-data/      the provider-neutral boundary (MarketDataProvider, routed provider)
  db/               Drizzle schema, client, migrations, repositories
  fyers/            Fyers API v3 client
  providers-fyers/  the Fyers adapter — the only place Fyers types and ours co-exist
  dhan/             Dhan API v2 client
  providers-dhan/   the Dhan adapter
config/             versioned YAML: indices, market calendar, IPO sources, screener presets
docs/               architecture, operations, planning, design system — see docs/README.md
scripts/            one-off operations and verification scripts
test/               integration-test helpers and the Playwright release smoke
tracker/            standalone Markdown work tracker; not part of the workspace
```

[docs/planning/pending-features.md](docs/planning/pending-features.md) carries the
code-verified status ledger: what is finished, what is built but unwired, and what
is still a plan.

## What is built

Every signed-in user gets:

| Page | What it shows |
| --- | --- |
| `/today` | Market Brief — a technical summary of the latest completed session |
| `/watchlists` | per-user lists with configurable columns, saved views and live quotes |
| `/screener` | the whole NSE EQ/BE/BZ universe filtered on ~95 nightly metrics; saved screens |
| `/stocks/[symbol]` | one stock: price chart, ratio board, "What stands out" facts, dividends and its screener metrics |
| `/markets/breadth` | advance/decline and participation across the universe |
| `/flows` | institutional flow — FII/DII cash, bulk/block deals, delivery, participant OI |
| `/announcements` | NSE/BSE corporate filings, categorised |
| `/calendar` | market holidays, results, corporate actions and watchlist events |
| `/ipos` | mainboard and SME IPOs from NSE, with an always-labelled unofficial GMP |
| `/portfolio` | the user's own hand-typed or imported holdings, valued at the last price |
| `/alerts` | price or RSI level crossings on a completed session |

`/admin` (user administration, logs, IPO pipeline health) is restricted to the
`admin` role. There are no fundamentals (P/E, ROE, market cap) — that needs a new
data source.

Signals, setups and paper trading were removed on 2026-10-17
([plan and record](docs/planning/signals-and-paper-removal-plan.md)). The app
states facts about the data; it never ranks stocks by its own conviction.

## Setup

```bash
pnpm install
cp .env.example .env     # then fill in the two database connection strings
pnpm build
pnpm --filter @equitywise/worker dev   # schedules every job; never mints a credential
```

`.env.example` documents each variable. The short version: both `DATABASE_URL`
and `DATABASE_URL_DIRECT` point at the self-hosted Postgres (identical on the VPS
and over a local SSH tunnel, since there is no pooler). Migrations run against
`DATABASE_URL_DIRECT` — `drizzle.config.ts` refuses a pooled URL.

Run one job now, or a deep history pull:

```bash
pnpm --filter @equitywise/worker dev -- --once ingest-daily
pnpm --filter @equitywise/worker dev -- --backfill
```

**Never point a local worker at production.** It writes to the live database, and
a credential mint kills the live Fyers token (one session per account). The `dev`
script sets `WORKER_MINT_CREDENTIALS=false` for that reason; local web-only work
against the VPS database is covered in
[`docs/operations/deployment.md`](docs/operations/deployment.md).

## Deploying (single VPS)

Both processes run on one Ubuntu VPS behind Nginx. Node 24 (see `.nvmrc`), pnpm,
and PM2 keep the web app (`next start -p 3000`) and the worker alive; Nginx
terminates SSL and reverse-proxies `:443 → :3000`. **Deploys are automatic — merge
to `main` and GitHub Actions ships it**, then runs a post-deploy smoke
(`scripts/post-deploy-smoke.sh`). The complete as-built reference — server,
pipeline, self-hosted Postgres, credentials, backups, DNS/SSL, local dev, and
operations — is **[`docs/operations/deployment.md`](docs/operations/deployment.md)**;
this section is only the shape.

Build with `pnpm build` (topological `tsc`, then `next build`), then start each
process under PM2. `.env` is gitignored; on the VPS it lives outside the checkout,
root-owned and `chmod 600`, and `next.config.ts` dotenv-loads the repo-root file.

The web app needs `DATABASE_URL`, the `AUTH_*` values (`AUTH_SESSION_SECRET` is
required in production; sign-up refuses to write without it), `RESEND_API_KEY` /
`AUTH_EMAIL_FROM` for account email, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
when Google sign-in is on, and `MARKET_DATA_PROVIDER` plus the provider app IDs for
live quotes. The login factors (`FYERS_ID`, `FYERS_TOTP_SECRET`, `FYERS_PIN`,
`DHAN_PIN`, `DHAN_TOTP_SECRET`) belong to the worker only. `next build` succeeds
without any of them — a missing value is a runtime failure, not a build error.

## Market-data credentials

Market-data tokens expire daily, and each new one starts from a 2FA login. Nobody
does that by hand here.

The **worker** holds the login factors, mints tokens and writes them to
`provider_credentials`. The **web app** reads that table and never mints anything.

| Job | When (IST) | What it does |
| --- | --- | --- |
| `refresh-credential` | 07:05 weekdays, and at startup | mints every held provider's token after Fyers' 07:00 expiry |
| `credential-rollover` | 01:35 daily | renews Dhan's 24-hour token in the middle of the night |
| `probe-credentials` | every 5 min, 09:00–15:59 Mon–Sat | one authenticated call per provider; a rejected token is re-minted (at most once per 10 min) |

That split is the security boundary, not an implementation detail. The TOTP seed
is the same 2FA secret that protects the brokerage login, including the
order-placing side this app deliberately has nothing to do with. It stays on a
host you control. What reaches the web app is a token that dies within the day and
can only read market data — so a compromise of the deploy costs a day of quote
access, not the account.

Setting only some of a provider's factors is reported at startup rather than
silently never refreshing. A refresh failure is logged loudly and does **not** fall
back to the stale token, because a request sent with an expired credential fails
upstream as an opaque authorisation error that hides the real cause.

The manual paths still exist: `pnpm fyers:login` writes `FYERS_ACCESS_TOKEN` into
`.env`, and an admin can run the Fyers OAuth handshake from the web app
(`/api/fyers/connect` → `/callback`). The daily refresh removes the need for either.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | every package in watch mode, plus `next dev` and the worker |
| `pnpm dev:web` | the web app only |
| `pnpm build` | topological `tsc` build, then `next build` |
| `pnpm test` | Vitest across the workspace |
| `pnpm test:coverage` | ditto, with a v8 coverage report |
| `pnpm test:integration` | DB-backed suites against a throwaway TimescaleDB container |
| `pnpm test:db:up` / `test:db:down` | start / drop that container |
| `pnpm test:e2e` | Playwright release smoke (`test/e2e`) |
| `pnpm lint` | Biome lint + format check |
| `pnpm lint:fix` | Biome, writing fixes |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm db:generate` | drizzle-kit: SQL migration from the schema |
| `pnpm db:migrate` | drizzle-kit: apply migrations (direct endpoint) |
| `pnpm db:studio` | drizzle-kit studio |
| `pnpm fyers:login` | manual Fyers token mint into `.env` |
| `pnpm dhan:probe` | read-only checks against the Dhan API |
| `pnpm verify:adjustment` | check whether the provider back-adjusts split history |
| `pnpm data:coverage` | report stored candle history and what recent ingestion runs did |
| `pnpm data:seed-disclosures` | seed sample filings and flows into a dev database (never production) |

## Database integration tests

Most of the suite is pure and needs nothing. The DB-backed suites — the ones that
assert schema-level guarantees a mock could never catch (one default watchlist per
user, no duplicate stock in a list, append-only alert history) — need a real
Postgres they may migrate from empty and throw away.

That database is **local and disposable**, run from `docker-compose.test.yml`:
**Postgres 17 + TimescaleDB**, the same stack the VPS runs, so the migrations'
`CREATE EXTENSION` and hypertables execute for real.

```bash
pnpm test:integration     # up → migrate → full suite → down (ephemeral, tmpfs)
```

That is the whole workflow — it needs no configuration. Under the hood it starts
the container, sets `TEST_DATABASE_URL`, and Vitest's global setup migrates the
schema once before any suite.

For an iterative loop, keep the database up and run the watcher against it:

```bash
pnpm test:db:up           # start the container (port 5433)
TEST_DATABASE_URL="postgresql://equitywise:equitywise@localhost:5433/nse_signals_test" pnpm test:watch
pnpm test:db:down         # stop it and drop the volume
```

Safety and skip rules (see [`test/db.ts`](test/db.ts)):

- `TEST_DATABASE_URL` must be **local** and its name must end in **`_test`**, or
  the suites refuse to run — so a test can never migrate or truncate a real
  database.
- Unset locally, the DB suites **skip** (a machine without Docker still runs
  every pure test). Unset **in CI**, they **fail** — CI always provides the
  database, so the DB-enforced invariants can never quietly stop being tested.

CI runs this exact suite against a TimescaleDB service container
(`.github/workflows/ci.yml`).

## Troubleshooting

**`Cannot find module './289.js'`** (or any numbered chunk) from `apps/web`.

Stale `.next` output. It happens when `pnpm build` runs while a Next server is
already serving that directory: the rebuild rewrites chunk hashes underneath the
live process, whose in-memory webpack runtime still points at the old ones.

```bash
lsof -ti:3000 | xargs kill      # stop the server first
pnpm clean                      # drop .next and every dist/
pnpm build
```

Avoid it by stopping `next dev` / `next start` before a workspace-wide build.

## TypeScript

`tsconfig.base.json` holds the shared settings — `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022 target,
NodeNext modules — and every package extends it.

`apps/web` is the one exception: Next.js bundles rather than emitting
Node-resolvable output, so it overrides `module`/`moduleResolution` to
`ESNext`/`Bundler` and adds the DOM libs. Every strictness flag is inherited
unchanged.

Workspace packages compile to `dist/` and are consumed through their `exports`
map, so `pnpm build` must run before `apps/web` or `apps/worker` can start.
