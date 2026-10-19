---
name: Public launch phase 0 record
status: complete
horizon: next
created: 2026-10-11
updated: 2026-10-11
area: [product, operations, docs]
summary: Approved scope, priorities, golden journey and control rules for the first EquityWise public release.
owner: krishna
---

# Public launch Phase 0 — scope and control record

## Decisions

- **Release source:** current `main` only, initially `e0033f7209064d417e19d18e3a0a17b6742da7eb`.
- **Excluded branches:** `feat/mobile-app` and `feat/multi-exchange-bse`. Neither branch is merged,
  inspected as launch input or included in release acceptance evidence.
- **Launch platform:** responsive web application. Native mobile remains preserved for later work.
- **Mobile files in the current working tree:** user-owned and preserved, but excluded from the
  `main` release scope and from launch conclusions.
- **Product boundary:** individual multi-user accounts; no organisations, teams, subscriptions,
  order execution or broker portfolio access.
- **Financial boundaries:** integer paise, completed candles, immutable price history, persisted
  evidence and provider-neutral business logic remain non-negotiable launch gates.

## Launch scope

The first release includes public/trust pages, first-party authentication, Market Brief,
watchlists, screener, stock research, closing-session alerts, user-entered portfolio research,
announcements, calendar, institutional flows, IPO research, profile/security controls and the
admin/operator health surfaces already present on `main`.

The release explicitly excludes fundamentals, options-chain research, native mobile, public
signal performance, additional alert channels, per-user index selection, NIFTY constituent
pages, subscriptions, organisation/team features and any order capability.

## Product promise

> After each NSE close, EquityWise helps self-directed Indian investors understand what changed,
> find stocks matching conditions they understand, and inspect the evidence behind each result —
> without broker access, tips or order execution.

## Golden journey

Landing → account creation/verification → Market Brief → starter screen → stock evidence →
watchlist/note → alert → optional portfolio → methodology/privacy/support → sign out and return.

This one journey is the required path for browser tests, the beginner guide, demo recording and
controlled beta.

## Supported release matrix

| Surface | Required |
| --- | --- |
| Desktop | Current Chrome, Safari and Edge at 1280px and 1440px |
| Phone | Current mobile Safari and Chrome at 375px and 390px |
| Tablet | 768px responsive layout |
| Themes | Light and dark |
| Input | Mouse, touch and keyboard |

Firefox is a best-effort P2 follow-up unless beta evidence makes it launch-critical.

## Severity and launch rules

- **Critical:** data exposure, cross-user access, authentication bypass, wrong financial data,
  forming-candle use, unrecoverable data loss or failed production deployment.
- **High:** golden journey blocked, repeated 5xx, misleading freshness, account recovery/deletion
  failure, a material accessibility barrier or materially incorrect public claim.
- **Medium:** important workflow degraded with a safe workaround.
- **Low:** cosmetic or non-blocking polish.

No Critical or High issue may remain at public launch. Financial correctness, privacy and
cross-user isolation cannot receive informal risk exceptions.

## Evidence rule

Code presence is not completion. Automated work needs a passing run, UI work needs browser
evidence, production configuration needs a live check, and legal/data-use work needs written
owner or professional approval. Each phase ends with an explicit exit review.

## Phase 0 exit result

The source, platform, scope, promise, golden journey, supported matrix, severity model and evidence
standard are fixed. Phase 1 may proceed without drawing either excluded branch into the release.
