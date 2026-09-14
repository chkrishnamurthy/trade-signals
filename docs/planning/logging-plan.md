# Logging plan — durable event log

**Status:** plan, not yet built (2026-09-14). No code changes until this is approved.

## Goal

Give EquityWise one **durable, queryable record of the events that matter** — who
did what to an account, and the handful of operational events that explain an
outage — without drowning it in noise, bloating the database, or storing data no
one will ever read.

## The principle (what decides everything below)

> Write a durable log entry only for something you would **act on, audit, or need
> to explain a real incident**. Everything else goes to stdout, or nowhere.

This is deliberately *not* "log everything." A log you cannot scan is worse than a
smaller one you can, and every stored field is one more thing to protect.

## Scope

**In scope — the durable DB event log:**

- **User / account activity** (the "who did what"): already partly built.
- **Worker job failures** (the recurring blind spot — e.g. a morning with no
  signals).
- **Fyers token lifecycle** (mint / refresh / invalidation — the usual root cause
  of the above).

**Explicitly out of scope (do NOT build):**

- Per-request / access logging in the DB. High volume, near-zero value here.
- Diagnostic/debug logging. That stays as plain **stdout → PM2 log files**, as it
  is today. We are *not* introducing a structured stdout logger in this plan; the
  durable DB log is the whole deliverable. (If stdout logging is tidied later, it
  is a separate, smaller piece.)
- Any admin **CRUD** UI (CLAUDE.md forbids it). The viewer here is read-only.
- Redis/Kafka/ELK or any new service (CLAUDE.md forbids; overkill for one VPS).
- Logging inside `packages/core` — it must stay pure. Events are emitted only at
  the edges (web routes, worker jobs, the provider adapter).

## Event catalog (the complete set)

Small on purpose — roughly a dozen event types, all low-volume.

| category | event | actor | emitted from |
|---|---|---|---|
| `auth` | `signup`, `login_success`, `login_failure`, `logout` | user | web auth routes *(exists)* |
| `account` | `password_changed`, `password_reset`, `email_change_requested`, `email_changed`, `verification_resent`, `account_deleted` | user | web account routes *(exists)* |
| `admin` | `role_changed`, `admin_disable_user`, `admin_enable_user` | user (admin) | admin route *(exists)* |
| `worker` | `job_failed` (detail: job name, error, duration) | worker | each worker job *(new)* |
| `provider` | `credential_minted`, `credential_refreshed`, `credential_invalidated` | worker | Fyers adapter *(new)* |

The `auth` / `account` / `admin` rows already exist via `writeAudit` (~19 call
sites). This plan **generalizes** what is there and adds the `worker` and
`provider` rows — it is not a rewrite.

> Deliberately NOT logged to the DB: `job_started` / `job_succeeded` (success is
> noise; a run's normal timing belongs in stdout). Only failures are durable.

## What exists today (reused, not replaced)

- `auth_audit` table — append-only via a trigger (`0013_*.sql`: `BEFORE UPDATE OR
  DELETE` raises), columns `at, event, user_id, ip_address, user_agent, detail`,
  indexed on `at` and `user_id`. (`packages/db/src/schema/auth.ts`)
- `writeAudit(db, entry)` — the single writer. (`packages/db/src/repositories/auth.ts`)
- Worker jobs with no durable logging today: `ingest-daily`, `compute-indicators`,
  `vwap-signals`, `refresh-credential`, `ingest-disclosures`. (`apps/worker/src/jobs/`)

## Design

### Schema: generalize `auth_audit` → `event_log`

One migration, additive:

- Rename `auth_audit` → `event_log`; keep every existing column and both indexes;
  keep the append-only trigger (rename to match).
- Add two columns, both with backfill defaults so existing rows stay valid:
  - `category text not null default 'auth'`
  - `actor_type text not null default 'user'` (`user` | `worker` | `system`)
- Add an index on `(category, at)` for the viewer's filters.

**Not a TimescaleDB hypertable.** The candle store is a hypertable because it is
enormous; this log is orders of magnitude smaller (a few rows per user action, a
few worker rows per day). A plain indexed table is simpler, and it avoids the
hypertable partitioning-key constraints. This is a deliberate departure from the
candle pattern, justified by volume.

### Writer: generalize `writeAudit` → `logEvent`

```
logEvent(db, { category, event, actorType, userId?, ipAddress?, userAgent?, detail? })
```

- Keep `writeAudit` as a thin wrapper (`category: 'auth', actorType: 'user'`)
  during migration so no existing call site breaks; migrate call sites over, then
  retire the wrapper.
- Every write is **best-effort** — a logging failure must never fail the request
  or the job. (Signup already does this: `sign-up/route.ts` wraps the audit write
  in try/catch.)

### New call sites

- **Worker** — wrap each job so an uncaught failure emits one `worker/job_failed`
  row (job name, error message, duration), then rethrows/handles as today. Lives
  in the worker's job runner so it is written once, not per job. Worker writes are
  allowed here (it owns its writes; the web/worker write boundary is unaffected).
- **Provider** — emit `provider/credential_*` from inside the Fyers adapter /
  refresh path (`refresh-credential` job + the self-heal path). Stays behind the
  provider boundary — no Fyers types leak; the event is a plain string + detail.

### Read side: `/admin/logs` (read-only)

- `GET /api/admin/logs` behind the existing admin guard (`getAdminUser()`), with
  filters: category, event, user, date range; newest first; paginated.
- A read-only page: filter + browse. No create/edit/delete → clear of the
  "no admin CRUD UI" rule.
- (Optional, later) a "recent activity" panel on the user's own profile, scoped to
  their own `user_id`.

## Guardrails

- **Append-only** trigger stays. A security log you can rewrite is not one.
- **Never** put a password, token, TOTP seed, or other secret in `detail` (the
  existing schema comment already says so).
- Keep PII minimal — email/name/IP where genuinely useful, nothing more.
- Timestamps `timestamptz` UTC; IST only at the presentation boundary.
- No logging in `packages/core`.

## Retention — recommendation: keep forever (no auto-drop)

The earlier draft said 12 months, but that assumed a high-volume hypertable. With
the trimmed, low-volume, **append-only** design, 12-month auto-deletion actively
conflicts with the append-only trigger (which blocks DELETE) and would weaken the
audit guarantee for a table that will stay small for years.

**Recommendation: keep all events, no automatic deletion.** If the table ever
grows enough to matter, the clean way to add retention *without* UPDATE/DELETE is
a monthly-partitioned table where old partitions are *dropped* (not deleted row by
row) — a future change, not now.

*(Open decision — see below — if you prefer a hard cap anyway.)*

## Testing

- `logEvent` + the migration's constraints (append-only still rejects UPDATE/
  DELETE; new columns default correctly) tested against the **local test DB** we
  just set up (`pnpm test:integration`, Postgres 17 + TimescaleDB).
- The admin route: authorization (non-admin gets 403) and filter correctness.

## Phasing (each phase ships independently)

1. **Migration + `logEvent`** — generalize `auth_audit` → `event_log`, add
   columns, add `logEvent`, migrate the ~19 existing auth call sites. No new
   events yet; pure refactor + schema.
2. **Worker `job_failed`** — the highest-value new signal.
3. **Provider `credential_*`** — the Fyers lifecycle.
4. **Read-only `/admin/logs`** viewer + API.
5. *(Optional)* user-facing "recent activity" panel.

## Open decisions

1. **Retention** — keep forever (recommended) vs a hard cap (would need the
   partition-drop approach, more work).
2. **Login failures** — keep logging every failed login (useful for spotting
   brute force) or only after N failures? Currently every one is logged.
3. **Phase order** — start with Phase 1 (foundation) or jump to Phase 2 (worker
   failures) for fastest operational value?
