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

## 5. Market-data credential (Fyers) — the part that breaks

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

---

## 10. File map (where things live)

- `.github/workflows/deploy.yml` — the auto-deploy workflow (repo).
- `/opt/equitywise/repo/` — the deployed checkout of `main` (VPS).
- `/opt/equitywise/repo/.env` — production secrets (VPS, not in git).
- `/opt/equitywise/scripts/deploy.sh` — pull + build + migrate + restart (VPS).
- `/opt/equitywise/scripts/backup-db.sh` — nightly dump (VPS, cron 02:30).
- `/opt/equitywise/scripts/restore-drill.sh` — restore verification (VPS).
- `/etc/nginx/sites-available/equitywise` — reverse proxy + TLS (VPS).
- `/etc/ssh/sshd_config.d/00-hardening.conf` — SSH hardening (VPS).
- `apps/worker/src/jobs/refresh-credential.ts` — mints the Fyers token.
- `apps/worker/src/jobs/intraday-signals.ts` — the cycle + credential self-heal.
- `packages/db/src/repositories/credentials.ts` — `provider_credentials` access,
  incl. `invalidateProviderCredential`.
