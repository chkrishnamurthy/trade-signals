# Where things live in this repo

Snapshot taken when the skill was written. Verify paths still exist before citing
them; if the tree has moved on, re-derive it with `find` rather than trusting this.

```
packages/shared/   money.ts (formatPaise, paise conversion), time.ts (IST/market
                   hours), timeframe.ts (bucketing). Pure, tested.
packages/core/     indicators/{rsi,macd,moving-average,atr}.ts, signals/{engine,
                   config,swing}.ts. MUST be pure — no DB, clock, env, network.
packages/fyers/    auth.ts (token cache + TOTP + OAuth), http.ts, rate-limit.ts
                   (token bucket), stream.ts (tick socket, reconnect, heartbeat),
                   quotes.ts, candles.ts, symbols.ts, instruments.ts, types.ts
                   (Zod), errors.ts. All Fyers-specific types stay here.
packages/db/       schema/, client.ts (pooled), env.ts, drizzle.config.ts.
apps/worker/       src/index.ts — croner scheduling. Ingestion + signal runs.
apps/web/          Next.js app router.
  src/app/api/     dashboard/[index], market/[index], history/[symbol], search,
                   signals/[index]
  src/app/         login/route.ts, callback/route.ts (Fyers OAuth), page.tsx,
                   dashboard/page.tsx, nifty50/page.tsx
  src/server/      dashboard.ts, market.ts, signals.ts, history.ts, search.ts,
                   analytics.ts, indices.ts, fyers-client.ts, errors.ts
  src/lib/         use-dashboard.ts, use-market.ts, dashboard-format.ts, format.ts,
                   watchlist.ts, dashboard-types.ts, market-types.ts
  src/components/  dashboard/* (newer), plus market-dashboard.tsx, stock-table.tsx,
                   stock-detail.tsx, index-header.tsx, market-status-badge.tsx
config/indices.yaml    index definitions + constituents
scripts/           fyers-login.ts, verify-adjustment.ts
```

## Known structural smells to confirm or dismiss (do not assert without reading)

There appear to be **two parallel generations of the dashboard**:

| Older | Newer |
|---|---|
| `components/market-dashboard.tsx`, `stock-table.tsx`, `stock-detail.tsx` | `components/dashboard/*` |
| `lib/use-market.ts` | `lib/use-dashboard.ts` |
| `lib/format.ts` | `lib/dashboard-format.ts` |
| `lib/market-types.ts` | `lib/dashboard-types.ts` |
| `api/market/[index]` | `api/dashboard/[index]` |
| `server/market.ts` | `server/dashboard.ts` |
| `app/nifty50/page.tsx` | `app/dashboard/page.tsx` |

Determine which is reachable from `app/page.tsx` and which is dead. Then check
whether the two implementations **disagree on any number** — a change %, a previous
close, a market-status rule computed two ways is a data-integrity finding, not just
duplication, because whichever one the user last looked at is the one they believe.

## Traps specific to this codebase

- `.fyers-token.json` sits at the repo root and is gitignored. Verify it is not in
  git history and check its file mode. Also check whether the path is configurable
  and whether anything logs its contents.
- `packages/fyers/src/stream.ts` deliberately wraps a caller-supplied transport so
  the binary protocol is not reimplemented. That design is defensible — grill the
  parts it *does* own: full resubscribe after reconnect, heartbeat-as-death,
  the 200-symbol cap, and what happens to ticks lost during the reconnect window.
- `packages/fyers/src/auth.ts` uses undocumented `/vagator/v2/*` endpoints for TOTP
  login. Grill: single-flight on re-login, account lockout on repeated failure,
  clock skew breaking TOTP, and whether failure is loudly human-actionable.
- `packages/core` purity is the load-bearing invariant. Any clock, env, or IO there
  invalidates every backtest.
- `coverage/` is gitignored but present on disk — do not review generated HTML, and
  do not treat a coverage percentage as evidence the tests are meaningful.
- `apps/web/.next/types/**` is generated. Ignore it. It does reveal that a route
  `api/market/[index]` was built at some point, which helps date the two generations.
- The project bans multi-tenancy, RBAC, Redis, admin CRUD, and `technicalindicators`.
  Do not recommend any of them. "Add auth" is not a valid finding for a localhost
  single-user tool; "the OAuth callback doesn't verify `state`" is.
