---
name: worker
description: apps/worker job conventions — scheduling, the write boundary with apps/web, overlap prevention, shutdown, holiday gating. Use when adding or changing a scheduled job, touching apps/worker/src, or when apps/web code might need something only the worker is allowed to write.
---

# worker

`apps/worker` is a plain long-running Node process (`tsx src/index.ts` in dev, `node
dist/index.js` in prod — no Docker, no PM2 config, no deploy manifest exists in this repo
yet, so don't assume one). Everything below is verified against the code as of the last
audit (2026-08-29).

## The write boundary is real, not just documented

Derived market data — `daily_indicators` (`jobs/compute-indicators.ts`), the nightly
`screener_snapshots` (`jobs/stock-analysis.ts`), the quote cache (`jobs/quote-cache.ts`)
and the exchange-session rows (`jobs/calendar-refresh.ts`) — is written only by the worker.
`apps/web` reads it. If new code in `apps/web` needs to write one of these, that is itself
the violation to report and stop on: two writers on the same rows will race. (The signal
and strategy-version writes this section once listed were removed on 2026-10-17.)

## Scheduling: croner, cron expressions, IST

`apps/worker/src/scheduler.ts` wraps `croner`. Jobs run on cron expressions, not plain
intervals, all in `Asia/Kolkata`; the full list is `buildScheduler` in
`apps/worker/src/index.ts`. A few of them:

| Job | Schedule |
|---|---|
| `refreshCredential` | `30 8 * * 1-5` |
| `ingestDaily` | `15 16 * * 1-5` |
| `computeIndicators` | `45 16 * * 1-5` |
| `ingestRetry` | `30 18 * * 1-5` |

In-session jobs (`refresh-latest-quotes`) are wrapped in `gated()`, which first asks the
exchange calendar (`sessionToday`, from `config/nse-calendar.yaml`) and is a logged no-op
on a holiday or weekend. The live feed and the intraday/paper-trading jobs that also used
it were removed on 2026-10-17.

**Overlap prevention is explicit, at two layers**: `JobDefinition.protect` defaults true
and the wrapper checks a `running: Set<string>` before starting a job by name; `croner`'s
own `protect` option is also passed. Every run is wrapped in try/catch so one job's
rejection can't kill the process.

## Shared context, built once

`createContext()` builds a `WorkerContext` once and threads it through every job: `db`
(Neon Postgres client, with an `onIdleError` handler that logs rather than crashes), one
`provider` (Fyers adapter instance — the rate limiter and circuit breaker live *inside*
the provider package so they track per-account budgets across credential swaps, not
per-job), `providerId`, a `setAccessToken` closure so the credential-refresh job can swap
tokens without rebuilding the provider, and `close()` to drain the pool. A new job takes
this context rather than constructing its own DB client or provider instance.

## Graceful shutdown

`SIGINT`/`SIGTERM` stop the scheduler, `await scheduler.drain()` (polls the running-job
set, default 30s timeout, warns if a run is still in flight when it expires), close the
DB pool, then exit. `unhandledRejection` logs only; `uncaughtException` logs and triggers
the same shutdown path. A new long-running job should be interruptible within that drain
window, not something that blocks shutdown indefinitely.

## The retry/backoff claim is narrower than CLAUDE.md states — see the `database` skill

`withRetry` (exponential backoff, well-tested) exists and is wired into exactly one call
site: `waitForDatabase()` at worker startup, before any job runs. **No individual job
retries a mid-run connection failure with backoff.** A per-symbol `try/catch` inside a job
(seen in every job file) is failure isolation between symbols, not connection retry. If a
new job needs resilience against a cold-start failure mid-run, that's `withRetry` wrapping
the job body — it doesn't exist yet, and shouldn't be assumed present.

## Structured logging

One JSON object per line: `ts` (ISO-8601 UTC), `level`, `job`, `message`, arbitrary
`fields`. Levels `debug|info|warn|error`, filtered by `LOG_LEVEL`; `warn`/`error` go to
stderr. `createLogger(job).child(subJob)` namespaces as `parent.child`. Errors are logged
via `errorName`/`errorMessage` only, deliberately never the full error object — "causes
can carry secrets." The scheduler adds `durationMs` automatically around every run. A new
job reuses this logger, not `console.log`.

## Config loading fails loudly, on purpose

Every YAML the worker loads (`config/nse-calendar.yaml`, `config/indices.yaml`,
`config/ipo-sources.yaml`, …) is Zod-validated on load and **throws** on an invalid file —
a bad config is a boot or job failure, not a runtime surprise three hours into the
trading session.
