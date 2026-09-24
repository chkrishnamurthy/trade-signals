# Mobile (Android) application

Everything about the EquityWise Android app — an Expo / React Native client that
lives in this monorepo as `apps/mobile` and talks to the existing backend over
HTTPS only. Documents are numbered in the order the work happens; each phase's
document is written **before** that phase is implemented and updated as it lands.

> **Status (2026-09-24):** Phases 1–3 are done and most of Phases 4–5 are **implemented on branch
> `feat/mobile-app`** (not merged or deployed). That covers server auth for the app, the shared
> packages, and the Expo app: sign-in incl. 2FA and Google, markets, watchlists, search, stock
> detail, account, and admin. It has **not yet run on a physical phone.** Next: follow
> [03-run-on-your-phone.md](03-run-on-your-phone.md); start the Play account from
> [07-play-store.md](07-play-store.md).

| # | Document | Phase | State |
| --- | --- | --- | --- |
| 01 | [01-discovery.md](01-discovery.md) | 1 — Discovery | Complete. Repo audit, technology verdict, proposed architecture, auth design, API gaps, environment strategy, risk register, settled decisions, first milestone |
| 02 | [02-architecture.md](02-architecture.md) | 2 — Architecture | Done. Decision record, server changes, app structure, verification, follow-ups |
| 03 | [03-run-on-your-phone.md](03-run-on-your-phone.md) | 3 — Foundation | Built. Step-by-step: Mac tools, phone setup, EAS dev build, daily loop, Google sign-in keys, tester builds |
| 04 | `04-authentication.md` | 4 — Auth | Implemented (see 02-architecture.md); doc not separate. Bearer sessions, secure storage, rotation, revocation, 2FA challenge, native Google sign-in, biometrics |
| 05 | `05-features.md` | 5 — Product | v1.0 scope implemented (see 02-architecture.md). One vertical at a time: watchlists → search → stock detail & charts → profile (signals hidden, announcements/flows/push later) |
| 06 | `06-hardening.md` | 6 — Hardening | Not started |
| 07 | [07-play-store.md](07-play-store.md) | 7 — Release | Guide written (S19): personal account, `io.equitywise.app`, closed test, listing, Data Safety, account deletion |
| 08 | `08-maintenance.md` | 8 — Maintenance | Not started |

## Rules that bind every phase

These are the product's hard rules from [`CLAUDE.md`](../../CLAUDE.md), restated for
a client that runs on a phone:

- The app **never** connects to Postgres, never holds a Fyers/Dhan credential, never
  imports `@equitywise/db`, `@equitywise/fyers`, `@equitywise/dhan` or either
  provider adapter. Its only outbound host is the API base URL.
- Prices are **integer paise** on the wire and in memory; `formatPaise()` from
  `@equitywise/shared` is the only path to a rupee string.
- Instants are **UTC** on the wire; IST only at render, via `@equitywise/shared`.
- `packages/core` stays pure; the app may import it, never add IO to it.
- **BUY / SELL** label a signal's direction and nothing else; every score renders
  with its factor breakdown or not at all; nothing in the app can act on a price.
- The worker remains the only writer of market data; push sending is a worker job.
- No secret is ever bundled: only `EXPO_PUBLIC_*` values reach the phone, and none
  of them is private.

## Where the decisions live

Settled decisions are recorded in [01-discovery.md §11](01-discovery.md#11-decisions)
(S1–S19) and will be carried into `02-architecture.md` as an ADR. Do not re-ask a
settled decision; reopen it explicitly if the facts change.
