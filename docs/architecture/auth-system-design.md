# Authentication system — design

Status: **proposal / for review** · Author: prepared with Claude · Date: 2026-09-05
Scope: design only. **No code has been changed.** This document is the plan to
review and agree before any implementation begins.

---

## 1. Summary

EquityWise had its Clerk authentication removed (commit `a32c3f2`) and is
currently **open to the public internet** with no login. This document designs a
**self-hosted, secure login system** whose user data — accounts, password
hashes, sessions — lives entirely in **our own PostgreSQL on the VPS**, with no
third-party auth vendor.

**Recommendation:** adopt **[Better Auth](https://better-auth.com)** with
email + password, database-backed sessions, and Argon2id password hashing. It is
the current market-standard for exactly this shape of app (self-hosted Next.js,
data ownership, secure by default) and it stores everything in our Postgres via
its Drizzle adapter — which is the stack we already run.

The one product decision that must be made before building is in
[§10](#10-decisions-needed-from-you): **is this a single-user gate, or true
multi-user with per-user watchlists?** The design supports both; they differ
mainly in whether watchlist rows gain an `owner_id`.

---

## 2. Goals and non-goals

### Goals
- A user can **sign up, log in, and log out** with an email and password.
- **Credentials are stored safely on our server**: passwords are Argon2id
  hashes (never plaintext, never reversible), in our own Postgres.
- **Sessions are server-side and revocable** — a login can be killed immediately
  from the database, not just left to expire.
- Every app route and API is **closed by default** again (restoring the posture
  Clerk gave us), so the public exposure ends.
- Built on the **existing stack** (Next.js 15, Drizzle, self-hosted Postgres 17,
  PM2 on the VPS) with no new managed service and no vendor lock-in.
- Room to grow into **OAuth (Google), email verification, password reset, and
  2FA** without re-architecting.

### Non-goals (for the first version)
- No multi-tenant organisations / teams / RBAC (Better Auth can add these later
  via plugins if ever needed — but see the product's "no multi-tenancy" rule).
- No social login on day one (Google can be added later — it's one config block).
- No self-service billing or subscriptions.
- No SMS/phone auth.

---

## 3. Current state and constraints

| Fact | Detail |
|---|---|
| Auth today | **None.** Clerk removed; every route open; site is public. |
| Framework | Next.js 15.5 (App Router), React 19, TypeScript strict. |
| Database | Self-hosted **PostgreSQL 17 + TimescaleDB** on the VPS, localhost-only. |
| ORM | **Drizzle ORM** 0.45; migrations via `drizzle-kit` (`docs/operations/deployment.md`). |
| Hosting | Single Hostinger VPS behind **Nginx (TLS)**, under **PM2**. |
| Deploy | merge to `main` → GitHub Actions → `deploy.sh` (pull, build, migrate, restart). |
| Secrets | repo-root `.env` (gitignored), loaded by `next.config.ts` and the worker. |
| Data model | Watchlists are **global — no `owner_id` column** (single-user by design). |
| Seam left for auth | `apps/web/src/app/layout.tsx` (wrap children) and a new `apps/web/src/middleware.ts` (route gate). Documented in the layout comment. |

**Constraints the design must respect**
- TLS already terminates at Nginx, so cookies can be `Secure` in production.
- Postgres is localhost-only — the DB is not reachable from the internet.
- Prices/candles rules in `CLAUDE.md` are unrelated to auth, but the **append-only
  and integer-paise invariants do not apply to auth tables** — those are ordinary
  mutable rows.
- The product is currently single-user; the roadmap (`docs/planning/pending-features.md`)
  may change that. The schema below is written so multi-user is an additive
  change, never a rewrite.

---

## 4. Requirements

### Functional
1. Sign up with email + password (password strength enforced).
2. Log in; wrong credentials fail with a generic, non-enumerating message.
3. Log out (revokes the current session server-side).
4. Stay logged in across refreshes and restarts (persistent session cookie).
5. Every page and `/api/*` route requires a session, except the auth routes
   themselves and static assets.
6. (Phase 2) Password reset by email; email verification; Google OAuth; TOTP 2FA.

### Non-functional / security
- Passwords hashed with **Argon2id** (OWASP 2025 params), unique salt per user.
- Sessions are **opaque random tokens** stored hashed in the DB; the cookie is
  `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed.
- **CSRF** protection on all state-changing requests.
- **Brute-force / rate limiting** on login and signup.
- No user enumeration (same response + timing for "no such user" and "wrong
  password").
- Secrets (signing key, DB URL) only in `.env`, never in the bundle or git.
- Sessions revocable and expiring; sensible absolute + idle timeouts.

---

## 5. Options considered

| Option | Data ownership | Effort | Security defaults | Verdict |
|---|---|---|---|---|
| **Better Auth** | Full — all rows in our Postgres | Low–medium | Strong (hashing, sessions, rate-limit, CSRF built in) | **Recommended** |
| Auth.js v5/v6 (NextAuth) | Full (DB sessions) | Medium | Good; credentials flow is more DIY | Viable, weaker DX for email/password |
| Hand-rolled (Argon2 + `iron-session`/custom) | Full | **High** | Only as good as we build; easy to get subtly wrong | Not worth the risk |
| Clerk / Auth0 / WorkOS (managed) | **Partner-held** | Low | Strong | Rejected — we deliberately left a vendor, and the ask is "data in our server DB" |

**Why Better Auth.** As of 2026 it is the actively-developed successor to Auth.js
and the default recommendation for self-hosted Next.js. Email/password, sessions,
CSRF, and rate-limiting are first-class and on by default; everything persists to
our Postgres through a **Drizzle adapter** (our ORM); and OAuth, passkeys, 2FA,
and password reset are opt-in plugins we can add later without migrating. It gives
us managed-service ergonomics with self-hosted data ownership — precisely the
requirement.

**Why not hand-rolled.** Auth is a place where small mistakes are security bugs
(timing leaks, session fixation, weak CSRF, cookie flags). A vetted library that
puts the data in our own DB gives us ownership *and* correctness; rolling our own
buys nothing but risk.

---

## 6. Recommended architecture

### 6.1 Request flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Nginx (TLS)
    participant M as Next.js middleware
    participant A as Better Auth handler (/api/auth/*)
    participant DB as Postgres (localhost)

    Note over B,DB: Sign in
    B->>N: POST /api/auth/sign-in/email {email, password}
    N->>A: proxy
    A->>DB: find user by email; verify Argon2id hash (constant-time)
    A->>DB: create session row (hashed token, expiry, ip, ua)
    A-->>B: Set-Cookie __Host-session (HttpOnly, Secure, SameSite=Lax)

    Note over B,DB: Every subsequent request
    B->>N: GET /watchlists (cookie)
    N->>M: proxy
    M->>DB: look up session by cookie token
    alt valid session
        M-->>B: allow (page renders)
    else missing/expired
        M-->>B: redirect to /login (pages) or 401 JSON (/api/*)
    end
```

### 6.2 Where each piece lives

- **`apps/web/src/lib/auth.ts`** — the Better Auth server instance: Drizzle
  adapter, email/password enabled, Argon2id hasher, cookie + session config.
- **`apps/web/src/app/api/auth/[...all]/route.ts`** — mounts Better Auth's
  handler for every auth endpoint (`/api/auth/sign-in`, `/sign-up`, `/sign-out`,
  session, …).
- **`apps/web/src/middleware.ts`** — the route gate (rebuilt in the seam the
  Clerk removal left). Closed by default: reads the session, redirects
  unauthenticated page requests to `/login`, answers unauthenticated `/api/*`
  with `401 UNAUTHENTICATED` JSON (the same shape the client already renders).
- **`apps/web/src/app/(auth)/login` and `/signup`** — the two auth pages
  (server-rendered, styled with the existing design system, no Clerk).
- **`apps/web/src/lib/auth-client.ts`** — the client hooks (`signIn`, `signOut`,
  `useSession`) for the login form and the header's user menu.
- **Postgres** — the four auth tables in §7, created by a new Drizzle migration
  (`0013_*`), applied by the normal deploy pipeline.

### 6.3 Session strategy — database sessions (not JWT)

Use **server-side database sessions**, not stateless JWTs.

- **Revocable immediately.** Deleting the `session` row logs the user out now —
  important for "log out everywhere" and for killing a leaked session. A JWT is
  valid until it expires no matter what.
- **Cheap here.** The session lookup is one indexed query against a localhost
  Postgres — sub-millisecond. We are not a globally-distributed edge app where
  stateless tokens earn their keep.
- The cookie holds only an **opaque random token**; the token is stored **hashed**
  in the DB, so a database read alone cannot resurrect a live session.

---

## 7. Data model

Four tables, created by a new migration and added to the Drizzle schema. Better
Auth expects roughly these shapes (its Drizzle adapter maps to them). All
timestamps are `timestamptz` in UTC, consistent with the rest of the DB.

### `user`
| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | Better Auth id |
| `name` | text | display name |
| `email` | text, unique, not null | login identifier |
| `email_verified` | boolean, default false | gates Phase-2 verification |
| `image` | text, null | optional avatar |
| `created_at` / `updated_at` | timestamptz | |

### `account`
Holds the **password hash** for the email/password provider (and, later, OAuth
provider links).

| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | |
| `user_id` | text, FK → `user.id`, cascade | |
| `provider_id` | text | `credential` for email/password; `google` later |
| `account_id` | text | provider's user id (== `user_id` for credentials) |
| `password` | text, null | **Argon2id hash**, only for the credential provider |
| `access_token` / `refresh_token` / … | text, null | OAuth only, later |
| `created_at` / `updated_at` | timestamptz | |

### `session`
| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | |
| `user_id` | text, FK → `user.id`, cascade | |
| `token` | text, unique | the session token (stored hashed) |
| `expires_at` | timestamptz | absolute expiry |
| `ip_address` / `user_agent` | text, null | for the "active sessions" view + audit |
| `created_at` / `updated_at` | timestamptz | |

### `verification`
Short-lived tokens for email verification and password reset (Phase 2).

| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | |
| `identifier` | text | e.g. the email being verified |
| `value` | text | the token (hashed) |
| `expires_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `user.email` (unique), `session.token` (unique), `session.user_id`,
`account.user_id`, `verification.identifier`.

> **Watchlist ownership.** In the **single-user gate** model, the watchlist
> tables are unchanged — everyone who is let in shares the one global list, which
> is exactly today's behaviour minus the public exposure. In the **multi-user**
> model, add `owner_id text references user(id)` to `watchlists` (and scope the
> `watchlists_name_idx` uniqueness per owner). The schema comment in
> `packages/db/src/schema/watchlists.ts` already anticipates this — it is an
> additive column, not a rewrite. See [§10](#10-decisions-needed-from-you).

---

## 8. Security design

| Concern | Mitigation |
|---|---|
| **Password storage** | **Argon2id**, OWASP 2025 params: **46 MiB memory, 1 iteration, 1 parallelism** (tune up if the VPS has headroom). Unique per-user salt. Never logged. |
| **Password strength** | Minimum length (≥ 12), reject known-breached/common passwords, no composition theatre. |
| **Session token** | Opaque, ≥ 256-bit random; stored **hashed** in `session.token`; the cookie is the only place the raw token exists. |
| **Cookie flags** | `HttpOnly` (no JS access → XSS can't read it), `Secure` (HTTPS only), `SameSite=Lax`, `__Host-` prefix (locks it to the exact host, no subdomain leakage). |
| **CSRF** | Better Auth's built-in CSRF protection on state-changing routes; `SameSite=Lax` is the second layer. |
| **Brute force** | Rate-limit login and signup (built-in), e.g. N attempts / IP / window, with backoff; log repeated failures. |
| **User enumeration** | Identical response body and timing for "unknown email" and "wrong password"; verification/reset always answer "if that account exists, we sent a link". |
| **Session lifetime** | Absolute expiry (e.g. 30 days) + idle refresh; "log out everywhere" deletes all `session` rows for the user. |
| **Transport** | TLS at Nginx already; cookies `Secure` in prod. Postgres localhost-only. |
| **Secrets** | `BETTER_AUTH_SECRET` (signing) and `DATABASE_URL` only in `.env` (gitignored, root-owned `chmod 600` on the VPS per `docs/operations/deployment.md`). |
| **SQL injection** | Drizzle parameterises everything; no string-built SQL in the auth path. |
| **Backups** | Auth tables are covered by the existing nightly `pg_dump` + Hostinger backups (`docs/operations/deployment.md §6`). |

**Threat model in one line:** the realistic attacks are credential stuffing,
brute force, session theft, and CSRF — each has a named mitigation above. The DB
being localhost-only and TLS being already in place remove whole classes of
network attacks.

---

## 9. Integration with the existing app

1. **Restore the gate.** Recreate `apps/web/src/middleware.ts` — closed by
   default, exactly like the Clerk one it replaces: unauthenticated page requests
   → redirect to `/login`; unauthenticated `/api/*` → `401 {code:"UNAUTHENTICATED"}`
   (the client's `use-watchlists` etc. already handle that shape).
2. **Auth routes stay open.** `/login`, `/signup`, and `/api/auth/*` are the only
   public paths (mirrors the old `isAuthRoute` allow-list).
3. **Login / signup pages.** Two server components using the existing design
   system components (`Button`, `Input`, `Card`, the `states.tsx` primitives) —
   no Clerk styling to reproduce.
4. **Header.** Re-add a small user menu (email + "Log out") to
   `components/layout/topbar.tsx` where the Clerk `UserButton` used to sit.
5. **Root layout.** Wrap `{children}` with the Better Auth session provider in the
   seam already marked in `layout.tsx`.
6. **First user.** Since sign-up will be open by default, either (a) keep signup
   open briefly to create your account then set `signup.disabled` (single-user),
   or (b) seed the first user with a one-off script. Recommended: **disable public
   signup** once your account exists — this is a personal tool.
7. **Env + deploy.** Add `BETTER_AUTH_SECRET` (and `BETTER_AUTH_URL=https://equitywise.io`)
   to the VPS `.env`; the `0013` migration ships through the normal pipeline.

Nothing in the market-data path, the worker, or the watchlist data layer changes.

---

## 10. Decisions needed from you

1. **Single-user gate vs multi-user?**
   - *Single-user gate* (recommended for now): one account (yours), public signup
     disabled after that, watchlist stays global. Smallest change, matches the
     product's "single-user, no multi-tenancy" rule in `CLAUDE.md`.
   - *Multi-user*: anyone can sign up, each person gets their **own** watchlists.
     Requires the `owner_id` column and per-owner scoping, and reverses the
     "no multi-tenancy" rule — a product decision, not just a technical one.
2. **Phase 1 scope** — is email + password enough to start, with **Google OAuth**,
   **email verification**, **password reset**, and **2FA (TOTP)** as Phase 2? (2FA
   is low effort here — the app already generates TOTP for Fyers.)
3. **Email provider** — password reset / verification need to send mail. Which
   service (Resend, Postmark, SES, or defer Phase 2 until chosen)?
4. **Signup policy** — open, invite-only, or disabled-after-first-user?

My default recommendation for a first cut: **single-user gate, email + password
only, public signup disabled after your account is created, Google/2FA/reset
deferred to Phase 2.** It ends the public exposure fastest with the least surface.

---

## 11. Rollout plan (once approved)

1. **Schema** — add the four auth tables to the Drizzle schema; generate migration
   `0013`. Review the SQL. (No drops; additive only.)
2. **Server wiring** — `lib/auth.ts` (Better Auth + Drizzle adapter + Argon2id),
   the `/api/auth/[...all]` route, `lib/auth-client.ts`.
3. **Gate** — recreate `middleware.ts`, closed by default.
4. **UI** — `/login` + `/signup` pages, header user menu, layout provider.
5. **Secrets** — `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` into the VPS `.env`.
6. **Verify locally** — typecheck, build, tests; sign up / log in / log out /
   gated-route flows against the tunnelled DB.
7. **Deploy** — merge to `main`; create your account; **disable public signup**.
8. **Confirm** — the site now requires login; `/api/*` returns 401 when signed
   out; your watchlist loads once signed in.

Each step is small, reversible, and lands behind the normal review + deploy flow.

---

## 12. References

- [Better Auth vs NextAuth vs Clerk — 2026 comparison (supastarter)](https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk)
- [Best auth library for Next.js in 2026 (LogRocket)](https://blog.logrocket.com/best-auth-library-nextjs-2026/)
- [OpenAuth vs Better Auth vs Auth.js v6 — self-hosted 2026 (PkgPulse)](https://www.pkgpulse.com/guides/openauth-vs-better-auth-vs-authjs-v6-self-hosted-2026)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Better Auth documentation](https://better-auth.com)
- Internal: `docs/operations/deployment.md` (VPS, deploy, backups, secrets), `CLAUDE.md`
  (single-user / no-multi-tenancy rule), `packages/db/src/schema/watchlists.ts`
  (the `owner_id` seam).
