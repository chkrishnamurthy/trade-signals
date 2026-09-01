---
name: deployment
description: Production infrastructure and operations for the self-hosted Hostinger VPS — the deploy pipeline (merge to main → GitHub Actions → deploy.sh), self-hosted Postgres 17 + TimescaleDB, the Fyers credential lifecycle and self-heal, backups, Nginx/SSL, and local-dev safety. Use when deploying, touching CI/CD or server config, debugging market-data/credential/rate-limit failures, changing the database host or connection, running backups/restores, or setting up local development against production.
---

# deployment

The whole app runs on one Hostinger VPS (Ubuntu): the Next.js web app, the croner
worker, and PostgreSQL, behind Nginx under PM2. Only Clerk and Fyers are external.
The authoritative, as-built reference is **`docs/deployment.md`** — read it before
acting; this skill is the short "don't get this wrong" list.

Verified as of the Aug–Sep 2026 migration off Vercel + Neon. Re-check `docs/deployment.md`
and the VPS before trusting a specific value.

## Deploys are automatic — never hand-edit the server

- **Merge to `main` deploys.** GitHub Actions (`.github/workflows/deploy.yml`)
  SSHes to the VPS and runs `/opt/equitywise/scripts/deploy.sh`
  (`git reset --hard origin/main` → install → `db:migrate` → build → `pm2 restart all`).
- Do **not** edit files in `/opt/equitywise/repo` on the server — `deploy.sh` does
  `git reset --hard`, so any local edit is wiped. All changes go through `main`.
- **Migrations run automatically on deploy.** Commit `pnpm-lock.yaml` whenever deps
  change or `--frozen-lockfile` fails the deploy. A failed build leaves the old
  version running (site never goes down from a bad deploy).

## The database is self-hosted on the VPS (not Neon)

- **PostgreSQL 17 + TimescaleDB**, localhost only. **Compression is enabled** here.
  Both `DATABASE_URL` and `DATABASE_URL_DIRECT` are `localhost:5432/nse_signals`
  (no pooler). Neon is a retained read-only fallback — do not delete it, and don't
  reintroduce Neon-only assumptions (pooled hosts, scale-to-zero, no compression).
- Never raw `pg_dump`/`pg_restore` a hypertable database without the
  `timescaledb_pre_restore()`/`post_restore()` wrapper — a plain restore mishandles
  compressed chunks. Cross-version moves rebuild the schema from migrations and copy
  data logically instead.

## Fyers credential — single-session, self-healing

- The **worker** mints the daily token into `provider_credentials`; the web app only
  reads it. **Never run a second thing that logs into Fyers** with the same account
  (a second worker, `pnpm fyers:login` elsewhere) — Fyers is single-session and the
  new login invalidates the old token.
- The worker **self-heals** a token invalidated early: on a wholesale cycle failure
  it calls `invalidateProviderCredential` so the next cycle re-mints (cooldown-guarded
  against mint-storms). Preserve that behaviour when touching `intraday-signals.ts` or
  the credential path.
- `Blocked upstream for another Ns` is the circuit breaker honoring a Fyers `429` ban.
  **Do not retry harder** — it extends the ban. Fix the cause (dead-token cascade,
  too-frequent calls, duplicate consumers), then wait it out.

## Local dev must not touch production

- **Do not run `pnpm run dev` against production** — it starts the worker, which
  writes to the live DB and invalidates the live Fyers token. Run web-only through an
  SSH tunnel (`docs/deployment.md` §8), or use `pnpm typecheck` / `lint` / `test`.

## Backups

- Nightly `pg_dump` (cron 02:30) + Hostinger weekly + snapshot. Restore uses the
  TimescaleDB wrapper (`/opt/equitywise/scripts/restore-drill.sh`). A VPS-only backup
  is not a backup — the off-server copy covers disk failure.

Report and stop on a violation; the fix is the author's call.
