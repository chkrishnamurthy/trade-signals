# NSE Signal Platform

Technical analysis and decision support for NSE equities. It answers what the
market is doing, which stocks deserve attention, and why — and it never places,
manages or represents an order. See [CLAUDE.md](CLAUDE.md) for the hard rules
that govern everything added on top.

## Layout

```
apps/
  web/            Next.js App Router + Tailwind
  worker/         Node entrypoint; scheduler and jobs live here
packages/
  shared/         paise + IST/market-time helpers — everything depends on this
  core/           pure engines: daily signals + intraday trade signals
  market-data/    the provider-neutral boundary everything above depends on
  db/             Drizzle schema, client, migrations
  fyers/          Fyers API v3 client
  providers-fyers/ the adapter — the only place Fyers types and ours co-exist
config/           versioned YAML: index constituents, intraday strategy config
```

## Intraday trade signals

`/signals` shows same-day intraday setups across the NIFTY 50, scored on
confluence across trend, price action, momentum, volume, VWAP, market context,
volatility and timeframe alignment. Every signal carries the factor breakdown
that produced its score, the individual observations behind it, its invalidation
conditions and a timeline of how it got there.

The engine (`packages/core/src/intraday`) is pure. The worker runs it every few
minutes while the market is open and stores the results; the web app only reads.

```bash
pnpm --filter @signal/worker dev              # schedule everything, incl. the intraday loop
pnpm --filter @signal/worker dev -- --once intraday-cycle   # one pass, now
pnpm verify:intraday --at "2026-08-21 13:30"  # replay any instant through the real engine
pnpm verify:intraday --scan                   # score every symbol, write nothing
pnpm verify:intraday --symbol RELIANCE        # full evidence for one symbol
```

Signals are technical observations, not advice, and the score is setup strength
— not a probability of profit.

## Setup

```bash
pnpm install
cp .env.example .env     # then fill in both Neon connection strings
pnpm build
pnpm --filter @signal/worker dev   # connects to Neon, prints the server version
```

`.env.example` documents which Neon endpoint goes in which variable and where
to find them in the console. The short version: `DATABASE_URL` is the **pooled**
host (`-pooler` in the hostname), `DATABASE_URL_DIRECT` is the **direct** host.
Migrations run against the direct one — `drizzle.config.ts` refuses to start if
it is handed a pooled URL.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | every package in watch mode, plus `next dev` |
| `pnpm build` | topological `tsc` build, then `next build` |
| `pnpm test` | Vitest across the workspace |
| `pnpm test:coverage` | ditto, with a v8 coverage report |
| `pnpm lint` | Biome lint + format check |
| `pnpm lint:fix` | Biome, writing fixes |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm db:generate` | drizzle-kit: SQL migration from the schema |
| `pnpm db:migrate` | drizzle-kit: apply migrations (direct endpoint) |
| `pnpm db:studio` | drizzle-kit studio |
| `pnpm verify:intraday` | replay the intraday engine at any instant and print the evidence |
| `pnpm verify:adjustment` | check whether the provider back-adjusts split history |

## Schema tests and Neon branches

The schema suite needs a database it may migrate from empty and then discard, so
it runs against a **throwaway Neon branch** rather than your production branch.
Each run forks a branch, applies the migrations, asserts, and deletes it.

### Automatic (preferred)

Set both of these in `.env` and the suite manages branches by itself:

```
NEON_API_KEY="napi_..."          # Console -> Account settings -> API keys
NEON_PROJECT_ID="tiny-brook-..." # Console -> Project settings -> General
```

Branches are named `test-<timestamp>-<random>`, so parallel runs never collide,
and are deleted in teardown even when a test fails.

If `NEON_API_KEY` is unset the schema suite **skips** rather than fails — the
rest of the workspace still tests fine without Neon access.

A Neon API key is account-scoped and can reach every project on the account.
Prefer an org- or project-scoped key, and rotate it if it ever leaves `.env`.

### Manual

If you would rather not hand over an API key, create the branch yourself:

1. Neon console -> your project -> **Branches** -> **Create branch**
2. Name it `test`, parent `production`, include a read-write compute
3. Copy its **direct** connection string (host *without* `-pooler`)
4. Put it in `.env` as `DATABASE_URL_TEST`, with `?sslmode=verify-full`

Or with the CLI:

```bash
neon branches create --project-id <id> --name test
neon connection-string test --project-id <id>
```

Clean up afterwards with `neon branches delete test --project-id <id>` — the
free plan caps branch storage at 512 MB each.

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
