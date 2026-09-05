# EquityWise

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
docs/             what is built, what is not — see pending-features.md
```

[docs/planning/pending-features.md](docs/planning/pending-features.md) is the current backlog:
which parts of the system are finished, which are built but unwired, and which
are declared in the sidebar without an implementation behind them.

## Intraday trade signals

`/signals` shows same-day intraday setups across the NIFTY 50, scored on
confluence across trend, price action, momentum, volume, VWAP, market context,
volatility and timeframe alignment. Every signal carries the factor breakdown
that produced its score, the individual observations behind it, its invalidation
conditions and a timeline of how it got there.

The engine (`packages/core/src/intraday`) is pure. The worker runs it every few
minutes while the market is open and stores the results; the web app only reads.

```bash
pnpm --filter @equitywise/worker dev              # schedule everything, incl. the intraday loop
pnpm --filter @equitywise/worker dev -- --once intraday-cycle   # one pass, now
pnpm --filter @equitywise/worker dev -- --once refresh-credential  # mint a token now
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
pnpm --filter @equitywise/worker dev   # connects to Neon, prints the server version
```

`.env.example` documents which Neon endpoint goes in which variable and where
to find them in the console. The short version: `DATABASE_URL` is the **pooled**
host (`-pooler` in the hostname), `DATABASE_URL_DIRECT` is the **direct** host.
Migrations run against the direct one — `drizzle.config.ts` refuses to start if
it is handed a pooled URL.

## Deploying (single VPS)

Both processes run on one Ubuntu VPS behind Nginx. Node 24 (see `.nvmrc`), pnpm,
and PM2 keep the web app (`next start -p 3000`) and the worker alive; Nginx
terminates SSL and reverse-proxies `:443 → :3000`. **Deploys are automatic — merge
to `main` and GitHub Actions ships it.** The complete as-built reference — server,
pipeline, self-hosted Postgres, credentials, backups, DNS/SSL, local dev, and
operations — is **[`docs/operations/deployment.md`](docs/operations/deployment.md)**; this section is only
the shape.

Build with `pnpm build` (topological `tsc`, then `next build`), then start each
process under PM2. `.env` is gitignored; on the VPS it lives outside the checkout,
root-owned and `chmod 600`, and `next.config.ts` dotenv-loads the repo-root file.

The web app reads exactly four values, and missing Clerk keys break every
request rather than the build:

| Variable | Missing it means |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `clerkMiddleware` throws on **every** request — the whole site 500s, including `/sign-in` |
| `CLERK_SECRET_KEY` | the same, one step later: sessions cannot be verified |
| `DATABASE_URL` | pages render, no data |
| `FYERS_APP_ID` | live quotes fail; stored signals still work |

`next build` succeeds without any of them — a missing key is a runtime 500, not a
build error. Nothing else belongs in the web app's environment — not
`DATABASE_URL_DIRECT`, not `FYERS_SECRET_KEY`, not `FYERS_TOTP_SECRET`, not
`NEON_API_KEY`. Migrations, the OAuth handshake and the schema tests all run from
the worker or a developer machine.

`FYERS_ACCESS_TOKEN` is absent from that table on purpose: the running app reads
its credential from the database, not the environment. See below.

## The daily credential

Market-data tokens expire every morning, and since the refresh-token flow was
withdrawn on 1 April 2026 each new one starts from a 2FA login. Nobody does that
by hand here.

The **worker** holds `FYERS_ID`, `FYERS_TOTP_SECRET` and `FYERS_PIN`, mints a
token at 08:30 IST on weekdays and at every startup, and writes it to
`provider_credentials`. The **web app** reads that row and never mints anything.

That split is the security boundary, not an implementation detail. The TOTP seed
is the same 2FA secret that protects the brokerage login, including the
order-placing side this app deliberately has nothing to do with. It stays on a
host you control. What reaches a deployed web app is a token that dies within the
day and can only read market data — so a compromise of the deploy costs a day of
quote access, not the account.

Set the three values in the worker's environment and the refresh runs on its own.
Setting only some of them is reported at startup rather than silently never
refreshing. Leave all three blank and the old manual path still works: run
`pnpm fyers:login`, which writes `FYERS_ACCESS_TOKEN` into `.env`.

`pnpm --filter @equitywise/worker dev -- --once refresh-credential` mints one now.
A refresh failure is logged loudly and does **not** fall back to the stale token,
because a request sent with an expired credential fails upstream as an opaque
authorisation error that hides the real cause.

### Running apps/worker

The worker is a long-running `croner` process — it needs a host that stays up,
which is why it runs under PM2 on the VPS alongside the web app. It needs
`DATABASE_URL`, `FYERS_APP_ID`, `FYERS_SECRET_KEY` and the three login factors
above. Without it running, nothing refreshes the token and nothing writes new
candles, signals or paper trades; the site serves whatever it last stored.

### Clerk instance

Until `equitywise.io` is pointed at the VPS, Clerk runs a **development**
instance (`pk_test_` / `sk_test_`): a production instance requires a domain you
own and DNS records you can add. Once the domain resolves to the VPS you can
create the production instance, add Clerk's CNAME records, verify it, and swap
`pk_test_` → `pk_live_` — that sequence, not flipping a setting.

What that costs, and why the allowlist below is not optional: a development
instance does not carry the session in a same-site cookie. It passes it as a
`__clerk_db_jwt` querystring parameter, which Clerk itself calls "not secure
enough for production use" because querystrings land in server logs and browser
history. On a publicly reachable host, Clerk's sign-up restriction is therefore
the real gate on this application, not a second layer behind one:

The instance is therefore configured `sign_up_mode: "restricted"`: nobody can
create an account at all, invitation or nothing. The single existing user signs
in as before, because sign-in is not gated by the sign-up mode.

Note that **`restricted` and the allowlist are mutually exclusive** — Clerk
rejects `allowlist: true` with `sign_up_mode_restricted_invalid_value` when the
mode is restricted. The allowlist is the weaker of the two: it applies to
`public` sign-up and permits anyone holding a listed address. For a tool with
exactly one user and that user already created, `restricted` is strictly
stronger and needs no list. The allowlist entry for the owner's address is left
in place, inert, so switching modes later does not lock anyone out.

`/login` and `/callback` write the refreshed Fyers token to disk — which the
VPS filesystem allows (a read-only serverless host could not). That path is only
for a manual login, which the worker's daily refresh removes the need for; the
running app reads its credential from the database instead.

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
