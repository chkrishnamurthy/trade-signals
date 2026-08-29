---
name: worker
description: apps/worker job conventions — scheduling, the write boundary with apps/web, overlap prevention, shutdown, strategy versioning. Use when adding or changing a scheduled job, touching apps/worker/src, or when apps/web code might need something only the worker is allowed to write.
---

# worker

`apps/worker` is a plain long-running Node process (`tsx src/index.ts` in dev, `node
dist/index.js` in prod — no Docker, no PM2 config, no deploy manifest exists in this repo
yet, so don't assume one). Everything below is verified against the code as of the last
audit (2026-08-29).

## The write boundary is real, not just documented

Signal writes happen in exactly two places, both in the worker: `saveSignal` (daily,
called from `jobs/compute-indicators.ts`) and `createIntradaySignal`/
`updateIntradaySignal` (intraday, called from `jobs/intraday-signals.ts`).
`registerStrategy` (mints/reuses `strategy_versions` rows) is called from those same two
job files and nowhere else. `apps/web` contains zero calls to any of these — confirmed by
grep, not assumed. If new code in `apps/web` needs to write a signal or a strategy
version, that is itself the violation to report and stop on, per `provider-boundary`'s
doctrine — two writers on the live-signal unique index will race.

## Scheduling: croner, cron expressions, IST

`apps/worker/src/scheduler.ts` wraps `croner`. Five jobs run on cron expressions, not
plain intervals, all in `Asia/Kolkata`:

| Job | Schedule |
|---|---|
| `refreshCredential` | `30 8 * * 1-5` |
| `ingestDaily` | `15 16 * * 1-5` |
| `computeIndicators` | `45 16 * * 1-5` |
| `ingestRetry` | `30 18 * * 1-5` |
| `intradayClose` | `32 15 * * 1-5` |

The intraday cycle itself uses a generated step expression, `*/${cycleMinutes} 9-15 * *
1-5`, with `cycleMinutes` read from `config/intraday.yaml` (default 3).

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

## Strategy versioning (rule 7) happens automatically, not as a separate step

`config/intraday.yaml`'s parsed config is passed straight into `registerStrategy` on
every `compute-indicators` and every intraday-cycle run. `registerStrategy` hashes the
config and only inserts a new `strategy_versions` row when the hash changed
(`.onConflictDoNothing`); an unchanged config reuses the existing row. **A version is
minted the moment a weight in the YAML changes and the worker next runs** — there is no
separate "publish a new strategy version" command to remember to run.

## Structured logging

One JSON object per line: `ts` (ISO-8601 UTC), `level`, `job`, `message`, arbitrary
`fields`. Levels `debug|info|warn|error`, filtered by `LOG_LEVEL`; `warn`/`error` go to
stderr. `createLogger(job).child(subJob)` namespaces as `parent.child`. Errors are logged
via `errorName`/`errorMessage` only, deliberately never the full error object — "causes
can carry secrets." The scheduler adds `durationMs` automatically around every run. A new
job reuses this logger, not `console.log`.

## Config loading fails loudly, on purpose

`intraday-config.ts` Zod-validates `config/intraday.yaml`, merges it over
`DEFAULT_INTRADAY_CONFIG`, and runs cross-field coherence checks that **throw at
startup** on an invalid combination — a bad config is a boot failure, not a runtime
surprise three hours into the trading session.
