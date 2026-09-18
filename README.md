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

## Intraday strategy and paper trading (admin-only)

`/intraday` shows one rule-based intraday strategy (opening-range breakout with
VWAP and volume confirmation) on the NIFTY 50 and its signals for the day;
`/paper-trading` simulates those signals automatically on a ₹2,00,000 virtual
portfolio per account — no real orders, ever. **Both pages and their APIs are
restricted to the `admin` role while the strategy is under evaluation**
(`docs/planning/intraday-strategy-dhan-plan.md`, `docs/planning/paper-trading-plan.md`);
a normal user is redirected to `/watchlists` and does not see them in the navigation.

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
cp .env.example .env     # then fill in the two database connection strings
pnpm build
pnpm --filter @equitywise/worker dev   # connects to Postgres, prints the server version
```

`.env.example` documents each variable. The short version: both `DATABASE_URL`
and `DATABASE_URL_DIRECT` point at the self-hosted Postgres (identical on the VPS
and over a local SSH tunnel, since there is no pooler). Migrations run against
`DATABASE_URL_DIRECT` — `drizzle.config.ts` refuses a pooled URL.

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
`DATABASE_URL_DIRECT`, not `FYERS_SECRET_KEY`, not `FYERS_TOTP_SECRET`.
Migrations, the OAuth handshake and the integration tests all run from the worker
or a developer machine.

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

## Database integration tests

Most of the suite is pure and needs nothing. The DB-backed suites — the ones that
assert schema-level guarantees a mock could never catch (one default watchlist per
user, no duplicate stock in a list, append-only signal history) — need a real
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
