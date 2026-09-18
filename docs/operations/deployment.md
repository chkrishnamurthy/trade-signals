# Deployment & production infrastructure

How EquityWise runs in production. This is the authoritative reference for the
server, the deploy pipeline, the database, credentials, backups, and day-to-day
operations. Written to be read cold — by a future maintainer or an AI tool — so
it states facts, paths, and commands rather than assuming context.

> Migrated from Vercel + Neon onto a single self-managed VPS in Aug–Sep 2026.
> The design rationale (why a VPS, why self-hosted Postgres) lived in a planning
> doc; this file records the resulting **as-built** system.

---

## 1. The shape in one picture

```
                         ┌──────────────────────────── Hostinger KVM 4 (Ubuntu 24.04) ────────────┐
 you ──https──▶ equitywise.io ──▶ Nginx :443  ──proxy──▶  Next.js web app  :3000   (PM2)          │
                    (DNS at Hostinger)     │                     │ reads                            │
                                           │                     ▼                                  │
                                           │            PostgreSQL 17 + TimescaleDB :5432           │
                                           │            (localhost only, compressed)                │
                                           │                     ▲ writes                           │
                                           │              croner worker (PM2) ──────────────────────┤
                                           └─────────────────────┼──────────────────────────────────┘
                                                                 │ market data (mints daily token)
                                                                 ▼
                                                            Fyers API  (external)
   auth on every request ─────────────────────────────────▶ Clerk       (external)
```

- **Everything runs on one VPS**: the web app, the background worker, and the
  database. Only **Clerk** (auth) and **Fyers** (market data) are external.
- **Nginx** is the only thing exposed to the internet. Postgres listens on
  localhost only.
- **Two long-lived processes** under PM2: `equitywise-web` (`next start`) and
  `equitywise-worker` (the croner scheduler). Both survive crashes and reboots.

### Quick-reference facts

| Thing | Value |
| --- | --- |
| VPS IP | `187.127.171.118` |
| OS | Ubuntu 24.04 LTS |
| SSH user | `krishna` (sudo); **root login disabled, key-only** |
| App directory | `/opt/equitywise/repo` (git clone of `main`) |
| Env file | `/opt/equitywise/repo/.env` (root of the checkout, `chmod 600`, gitignored) |
| Node | 24 (`.nvmrc`), pnpm 10 via corepack |
| Web process | `equitywise-web` → `next start -p 3000`, behind Nginx |
| Worker process | `equitywise-worker` → `node apps/worker/dist/index.js` |
| Database | `nse_signals`, role `equitywise`, `localhost:5432` |
| Scripts | `/opt/equitywise/scripts/{deploy,backup-db,restore-drill}.sh` |
| Backups | `/opt/equitywise/backups/` (nightly), + Hostinger weekly + snapshot |
| Domain | `equitywise.io` (+ `www`), DNS + nameservers at Hostinger |

---

## 2. The server (Ubuntu, hardened)

- Login as **`krishna`** over SSH **keys only** (`ssh krishna@187.127.171.118`).
  Password auth and direct root login are disabled (`/etc/ssh/sshd_config.d/00-hardening.conf`).
- **UFW firewall**: default-deny inbound, only **22 / 80 / 443** open. Postgres
  (5432) is never reachable from outside.
- **Fail2ban** bans SSH brute-forcers; **unattended-upgrades** applies security
  patches automatically.
- **PM2 + systemd** (`pm2-krishna.service`, enabled) resurrect both processes on
  reboot. `pm2 save` has been run so the process list persists.

---

## 3. Deploy pipeline — push-to-`main` auto-deploys

**Merging to `main` deploys automatically.** You never SSH in to deploy.

```
branch → PR → merge to main → GitHub Actions (.github/workflows/deploy.yml)
        → SSH into the VPS → /opt/equitywise/scripts/deploy.sh
        → git reset --hard origin/main → pnpm install → db:migrate → pnpm build → pm2 restart all
        → equitywise.io live (~1–2 min).  Watch it in the repo's Actions tab.
```

- **Auth**: GitHub holds a dedicated ed25519 private key (repo secret
  `VPS_SSH_KEY`, **base64-encoded** to survive the secret UI). Its public key is
  in `krishna`'s `authorized_keys` with a **forced command** — that key can
  *only* run `deploy.sh`, never open a shell.
- **`deploy.sh` behaviour**: migrations run automatically; a failed build leaves
  the previous version running (a bad deploy never takes the site down — it just
  shows a red ✗ in Actions).
- **Gotcha**: if you change dependencies, commit the updated `pnpm-lock.yaml` too,
  or `pnpm install --frozen-lockfile` fails the deploy.
- **Manual deploy (fallback only)**: `ssh krishna@… && /opt/equitywise/scripts/deploy.sh`.
- **Rollback**: revert the offending commit on `main` (the revert auto-deploys),
  or on the server `git checkout <prev> && pnpm build && pm2 restart all`.

---

## 4. Database — self-hosted PostgreSQL 17 + TimescaleDB

**This replaced Neon.** The production database is self-hosted on the VPS.

- **Versions**: PostgreSQL 17 + TimescaleDB 2.29. *(PG17, not 18, because
  TimescaleDB has no PG18 apt package. Neon ran PG18; the version gap was bridged
  by rebuilding the schema from the app's own drizzle migrations and copying the
  data logically — never a raw dump/restore, which mishandles hypertables.)*
- **Compression is ENABLED** (Neon could not do this): `minute_candles` and
  `daily_candles` have `timescaledb.compress` set plus an `add_compression_policy`.
  Old chunks auto-compress; `minute_candles` shrank ~90% (≈246 MB → ≈14 MB), whole
  DB ≈34 MB. This is the durable fix for the "database nearly full" problem that
  drove the migration.
- **Connection**: both `DATABASE_URL` and `DATABASE_URL_DIRECT` point at
  `postgresql://equitywise:…@localhost:5432/nse_signals` (no SSL needed on the
  loopback, no pooler). The pooled/direct split only ever mattered on Neon; the
  code still reads both, and locally they are the same string.
- **Migrations** run via `pnpm --filter @equitywise/db db:migrate` (drizzle-kit),
  automatically on every deploy. The append-only guards and CHECK constraints
  from `0002_guards.sql` / `0004_intraday_guards.sql` are in force.
- **Neon is retained as a read-only fallback** holding the migration-time
  snapshot. **Do not delete it** until the VPS has proven stable for weeks. Its
  old caveats (no compression, scale-to-zero cold starts, no `pg_cron`) applied to
  Neon only and no longer describe production.

---

## 5. Market-data credentials (Fyers, Dhan) — the part that breaks

Fyers tokens **expire daily** (~07:00 IST) and Fyers allows **one active session
per account**. The worker owns this:

- The worker holds `FYERS_ID` + `FYERS_TOTP_SECRET` + `FYERS_PIN` and **mints a
  fresh token automatically** at 08:30 IST and at startup, storing it in
  `provider_credentials`. The web app only *reads* that token — it never mints.
- **Single-session gotcha**: any *other* Fyers login with the same account (e.g.
  logging into the Fyers app to place a manual trade) **invalidates the worker's
  token early**, before its recorded expiry.
- **Self-heal** (`invalidateProviderCredential`, called from the intraday cycle):
  when a whole cycle fails because the token was rejected, the worker expires the
  stored credential so the **next cycle re-mints** — automatically, at most once
  per 10 min (so a genuine upstream outage can't cause a login storm).
- **Rate-limit / circuit breaker** (`packages/fyers`): a token-bucket limiter
  self-throttles outgoing calls; on a Fyers `429` a circuit trips and blocks
  upstream for the ban duration (`Blocked upstream for another Ns`). A sustained
  flood of failed calls (e.g. an unhandled dead-token cascade) can escalate Fyers
  to a multi-minute or ~1-hour account ban — **wait it out; retrying extends it.**

**If the dashboard shows "Market data unavailable" / `RATE_LIMIT`:**
1. `pm2 logs equitywise-worker` — look for `credential has expired` or `Blocked upstream`.
2. If it's a long `Blocked upstream` (hundreds/thousands of seconds): a Fyers ban.
   Stop retrying and wait it out.
3. To force a fresh token now:
   `sudo -u postgres psql -d nse_signals -c "UPDATE provider_credentials SET expires_at = now() - interval '1 minute' WHERE provider_id='fyers';"`
   The worker re-mints on its next cycle (no restart needed).
4. Make sure **nothing else** is logged into Fyers with the same account (a second
   worker, a `pnpm fyers:login` elsewhere, the trading app).

### Dhan — the second provider (added 2026-09-17)

Dhan is wired in beside Fyers as a second `MarketDataProvider` (plan and evidence:
`docs/planning/dhan-provider-plan.md`). What differs operationally:

- **Selection.** `MARKET_DATA_PROVIDER=fyers|dhan|routed` in **both** processes'
  environments (default `fyers`). `routed` is the production shape: daily/weekly
  bars, quotes and the instrument master from Dhan; intraday bars, market status
  and the tick socket from Fyers; either provider answers for the other on an
  auth / rate-limit / upstream failure. Per-route overrides are
  `MARKET_DATA_ROUTE_*` (see `.env.example`). `/data-sources` shows the live table.
- **Credential.** The worker holds `DHAN_CLIENT_ID` + `DHAN_PIN` + `DHAN_TOTP_SECRET`
  and mints a token (documented TOTP endpoint) **at 01:35 IST daily and at
  startup**, into `provider_credentials` row `provider_id='dhan'` (`app_id` = the
  client id). A Dhan token lives **24 h from its mint** — not to a fixed hour like
  Fyers — which is why the rollover runs at night rather than with the 07:05
  Fyers refresh. `RenewToken` does not apply to TOTP-minted tokens (verified);
  the worker simply re-mints. The web host needs only `DHAN_CLIENT_ID`.
- **Not single-session.** Logging into the Dhan app or web does **not** kill the
  worker's token. The self-heal still covers Dhan (a rejected token is re-minted
  at most once per 10 min per provider); it just has far less to do.
- **Mint throttle.** Dhan allows one mint per **2 minutes**; a second attempt
  surfaces as `RATE_LIMIT` with `retryAfterMs: 120000`, never as an auth failure.
  A correct TOTP is occasionally rejected once ("Invalid TOTP") when a code is
  reused inside its 30 s window — the worker never does that.
- **Rate limits.** Data calls are self-throttled to 3/s (Dhan documents 5/s but
  bans at ~4/s bursts, `HTTP 429 DH-904`); quotes 1/s. A ban trips the same
  circuit breaker as Fyers (`Blocked upstream for another 60s`). Auth traffic
  appears to share the data budget — one more reason never to mint in a loop.
- **Subscription.** The Data API is **₹499 + GST per 30 days, auto-debited from
  the trading balance**. If the debit fails every Dhan call answers with an
  authorisation error whose remedy names the subscription. Check: web.dhan.co →
  DhanHQ Trading APIs → Data APIs, or `pnpm dhan:probe` (prints
  `dataPlan`/`dataValidity`). Under `routed`, a lapsed subscription degrades to
  "everything answered by Fyers" with a warning per call, not an outage.
- **Known gap.** Dhan's **equity 1-minute history ends at 15:14 IST** (the closing
  15 minutes and the closing auction are absent; index minutes are complete;
  daily bars are complete). That is why intraday bars default to Fyers.
- **Live socket.** Dhan's feed is a documented binary websocket
  (`wss://api-feed.dhan.co`), spoken directly by `packages/dhan/src/stream.ts` over
  Node's built-in `WebSocket` — no SDK. **5,000 symbols per connection** (Fyers: 200),
  five connections per account. It is built, tested and live-verified but **not the
  default**: `MARKET_DATA_ROUTE_STREAM=dhan` moves the watchlist's live prices onto
  it; `DHAN_STREAM=0` is its kill switch. It uses the same token as REST, so a feed
  disconnect with reason 807–810 is a dead token (the hub then polls; the worker's
  next refresh fixes it) and 806 is the subscription. The feed's trade times are
  IST wall-clock seconds, not UTC — the adapter corrects them.

**To force a fresh Dhan token now:**
`sudo -u postgres psql -d nse_signals -c "UPDATE provider_credentials SET expires_at = now() - interval '1 minute' WHERE provider_id='dhan';"`
then `node apps/worker/dist/index.js --once refresh-credential` (or wait for the next cycle).

**To compare the two providers' bars** (run here — the only host with a live Fyers token):
`node apps/worker/dist/index.js --once cross-check-bars` — logs per-symbol agreement in paise
for NIFTY 50 + a sample of constituents, 60 days of 1d and 5 sessions of 1m. Writes nothing.

### Live prices — the tick socket and the fan-in hub

The watchlist's per-second prices come from **one Fyers data socket per web
process**, opened by `apps/web/src/server/live-quotes.ts` and fanned out to every
open watchlist over server-sent events (`GET /api/watchlists/:id/live`). Fyers load
scales with the number of **distinct symbols on screen**, not the number of users —
this is the fan-in from `docs/planning/market-data-scaling-plan.md`, delivered for
the live-price path.

- The socket is the official `fyers-api-v3` SDK, wrapped by `packages/fyers`
  (`sdk-transport.ts`). It uses the **same token** as REST, so everything in this
  section about expiry and single-session applies to it too. When the worker
  re-mints, the web app's provider is rebuilt and the socket reconnects with the
  new token on its own.
- **Automatic fallback.** While the socket is not delivering (connecting, silent
  for 10 s, over the 200-symbol cap, SDK missing, or `FYERS_STREAM=0`), the hub
  polls REST every 3 s for the uncovered symbols. The page shows *"Updating every
  few seconds"* instead of *"Live"*. Nothing breaks; it is just slower.
- **Kill switch:** `FYERS_STREAM=0` in the web app's environment disables the
  socket entirely (restart the web process). Use it if the socket is suspected of
  tripping the account's limits.
- **Nginx:** the route sets `X-Accel-Buffering: no` and pings every 15 s, which is
  enough for the default `proxy_read_timeout` (60 s). If a custom location block
  sets `proxy_buffering on` explicitly for `/api/`, exempt `/api/watchlists/*/live`.
- **One process only.** The hub is a per-process singleton; running `next start` in
  PM2 cluster mode would open one socket per instance. Keep it in fork mode.
- **Dhan instead of Fyers for the socket:** `MARKET_DATA_ROUTE_STREAM=dhan` under
  `MARKET_DATA_PROVIDER=routed` — see the Dhan sub-section above. Everything in
  this section about the hub, fallback polling and Nginx applies unchanged; only
  the per-process symbol cap changes (200 → 5,000).

---

## 6. Backups

- **Nightly** `pg_dump -Fc` at 02:30 via cron (`/opt/equitywise/scripts/backup-db.sh`,
  logs to `/opt/equitywise/logs/backup.log`), keeping the 14 most recent in
  `/opt/equitywise/backups/`. Uses `~/.pgpass` so it needs no password prompt.
- **Off-server**: Hostinger's **weekly** whole-VPS backups (included) + a manual
  snapshot baseline, both on Hostinger's own infrastructure.
- **Restore** (TimescaleDB needs the wrapper calls; see
  `/opt/equitywise/scripts/restore-drill.sh`, which restores into a scratch DB and
  compares row counts — proven to pass):
  ```
  sudo -u postgres psql -c "CREATE DATABASE nse_restore;"
  sudo -u postgres psql -d nse_restore -c "CREATE EXTENSION timescaledb; SELECT timescaledb_pre_restore();"
  sudo -u postgres pg_restore --no-owner -d nse_restore /opt/equitywise/backups/<file>.dump
  sudo -u postgres psql -d nse_restore -c "SELECT timescaledb_post_restore();"
  ```
- A backup that lives only on the VPS is not a backup — the off-server layer is
  what covers a disk failure.

---

## 7. DNS, SSL, and what's external

- **DNS** (Hostinger, nameservers `*.dns-parking.com`): `A @ → 187.127.171.118`,
  `www` follows. Keep Hostinger's nameservers; only edit records. No MX (no email).
- **SSL**: Let's Encrypt via Certbot (`certbot --nginx`), **auto-renewing** on a
  systemd timer. HTTP redirects to HTTPS. `sudo certbot certificates` to inspect.
- **Clerk** (auth): stays external, **never self-hosted**. Currently a *development*
  instance (`pk_test`), which works on the real domain; upgrading to a production
  instance is optional and needs Clerk-side DNS records — see the migration plan.
- **Fyers** (market data): external; worker-only secrets (§5).
- **Kept as fallbacks** until the VPS is proven over weeks: the old **Vercel**
  web deployment and the **Neon** database. Retire only during final cleanup.

---

## 8. Local development

Production lives on the VPS, so local dev needs care:

- **Do NOT run the full `pnpm run dev` against production.** It starts the worker,
  which would write to the live DB *and* invalidate the live Fyers token
  (single-session). This is actively harmful.
- **Web-only + tunnel** (safe — the web app is read-only): the Mac's `.env` points
  the DB at `localhost:15432`, an SSH tunnel to the VPS Postgres.
  ```
  ssh -N -L 15432:localhost:5432 krishna@187.127.171.118   # terminal 1, leave running
  pnpm --filter @equitywise/web dev                        # terminal 2 → localhost:3000
  ```
  Note: this reads (and, for write features, mutates) the **live** database.
- **Fast checks that need no DB/Fyers**: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
  Prefer these to verify most changes before merging.
- **Ideal (not yet set up)**: a separate throwaway dev database (+ a dev Fyers app)
  so `pnpm run dev` is fully isolated from production.

---

## 9. Operations & maintenance

Almost everything is automatic. What's yours to watch:

| Concern | Handled by | Check / action |
| --- | --- | --- |
| App alive (web + worker) | PM2 + systemd (restart on crash & reboot) | `pm2 status` → both `online` |
| HTTPS cert | Certbot timer (~60-day renew) | `sudo certbot certificates` |
| Daily Fyers token | Worker (08:30 IST + startup, self-heals) | `pm2 logs equitywise-worker` |
| Security patches | `unattended-upgrades` | occasional `sudo apt update && sudo apt upgrade` |
| DB backups | nightly cron 02:30 | `ls -lh /opt/equitywise/backups` |
| Disk space | compression keeps DB ~34 MB | monthly `df -h` |

**One-minute health check:**
```
pm2 status                              # web + worker online?
systemctl is-active postgresql nginx    # both active?
df -h /                                 # root under ~85%?
pm2 logs equitywise-worker --lines 40 --nostream
```

**Red flags:** a process not `online` or a climbing restart (`↺`) count; `df -h`
root over ~85%; repeated DB errors or `credential`/`Blocked upstream` in the worker
logs; a browser certificate warning; no fresh signals during market hours.

### Paper trading (per-user simulation; docs/planning/paper-trading-plan.md)

**What runs.** On trading days the worker opens the Dhan socket at 09:05
(`feed`), writes one sampled price per stock per second into
`signal_observations`, and the 5-second REST quote sweep stands down while the
socket is healthy (it resumes on its own after 15 s of silence). The paper jobs
then read those rows: `paper-entries` decides every new signal for every
switched-on portfolio (with the scan, and each minute as a sweep),
`paper-monitor` applies observations to live paper trades every second from a
checkpoint (`worker_checkpoints`), `paper-squareoff` runs from 15:15 every
15 s, `paper-snapshot` every 5 minutes, `paper-reconcile` at 15:45 and 06:45.
`calendar-refresh` (06:30) writes the day's `exchange_sessions` row from
`config/nse-calendar.yaml`; `calendar-check` (09:20) marks the day
`CLOSED_UNSCHEDULED` if the provider says closed and no price arrived.

**No orders, no funds.** Nothing in the tree can reach an order, positions,
holdings or funds endpoint — `packages/market-data/src/__tests__/no-execution.test.ts`
fails the build otherwise. Keep the Dhan account empty of funds and, if the
platform allows, with API order permissions off.

**Calendar upkeep (yearly, and on any NSE circular).** Edit
`config/nse-calendar.yaml`: holidays, special sessions (Muhurat timings), then
move `verifiedThrough` forward. The worker warns daily (and `/admin/paper`
shows red) from 14 days before that date. The Muhurat row is a placeholder
until the circular lands — confirm its times.

**Reading the health page (`/admin/paper`, admin only).** Session and
calendar, feed mode and last sample age, portfolios on / with live trades,
"open after the close" (must be 0 by 15:30:15), ledger mismatches (must be 0),
and each job's last cycle. Every red item is also a `paper_risk_events` row
and an `error` log line in `pm2 logs equitywise-worker`.

**Reading a declined signal.** The paper page's activity list shows each
decision with its reason in plain words; the stored code is on
`paper_orders.reason_code` (list in `packages/shared/src/paper.ts`). "Signal
came before you switched on" is the activation rule: only intents whose
candle closed after `enabled_at` are taken.

**What "Unavailable" means.** The price coverage broke for more than 15 s
while a paper trade was live, or no covered price arrived before the close.
The trade is closed at the last sampled price, flagged `resolution =
UNAVAILABLE`, kept in the history and excluded from every performance rate —
never guessed, never carried overnight.

**Replay after close.** `pnpm replay:intraday --date YYYY-MM-DD --portfolio`
re-runs the stored session through a ₹2,00,000 book with default limits and
prints decisions, ledger and result; a live portfolio with the same settings
must show the same decisions and levels (fills differ only by data tier).

**One-off before merging migration 0024:** `pnpm data:export-legacy --out
/opt/equitywise/backups/legacy-$(date +%F)` on the VPS. The migration drops the
retired `vwap_*`, `signal_scan_runs` and `paper_stud*`/`paper_equity_marks`
tables; the export is the only copy afterwards.

---

## 10. File map (where things live)

- `.github/workflows/deploy.yml` — the auto-deploy workflow (repo).
- `/opt/equitywise/repo/` — the deployed checkout of `main` (VPS).
- `/opt/equitywise/repo/.env` — production secrets (VPS, not in git).
- `/opt/equitywise/scripts/deploy.sh` — pull + build + migrate + restart (VPS).
- `pnpm dhan:feed-probe --minutes 30 --out <file>` — measures the Dhan live socket during a session (tick gaps, skew, reconnects); read-only. Paper trading (docs/planning/paper-trading-plan.md) never places orders: the Dhan account should hold no funds and the `no-execution` test fails the build on any order code.
- `config/nse-calendar.yaml` — the exchange calendar the paper engine gates on (operator-verified; see §9).
- `apps/worker/src/jobs/{feed,calendar-refresh,paper}.ts` — the socket feed, the calendar service and the per-user paper jobs.
- `pnpm data:export-legacy --out <dir>` — exports the retired VWAP-page tables before migration 0024 drops them.
- `/opt/equitywise/scripts/backup-db.sh` — nightly dump (VPS, cron 02:30).
- `/opt/equitywise/scripts/restore-drill.sh` — restore verification (VPS).
- `/etc/nginx/sites-available/equitywise` — reverse proxy + TLS (VPS).
- `/etc/ssh/sshd_config.d/00-hardening.conf` — SSH hardening (VPS).
- `apps/worker/src/jobs/refresh-credential.ts` — mints every held provider's token
  (`apps/worker/src/credentials.ts` holds the per-provider strategies).
- `apps/worker/src/jobs/cross-check-bars.ts` — Fyers-vs-Dhan bar comparison (`--once`).
- `apps/worker/src/jobs/intraday-signals.ts` — the cycle + credential self-heal.
- `packages/db/src/repositories/credentials.ts` — `provider_credentials` access,
  incl. `invalidateProviderCredential`.
