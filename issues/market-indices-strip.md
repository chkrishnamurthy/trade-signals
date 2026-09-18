---
id: EW-133
title: Market indices strip under the page header
type: feature
stage: now
priority: high
area: [web]
plan: market-indices-strip-plan
created: 2026-09-18
updated: 2026-09-18
stage_since: 2026-09-18
source: docs/planning/market-indices-strip-plan.md
refs:
  - apps/web/src/components/layout/app-shell.tsx
  - apps/web/src/components/market/index-strip.tsx
  - apps/web/src/components/market/index-cell.tsx
  - apps/web/src/server/indices.ts
  - apps/web/src/server/live-quotes.ts
  - config/indices.yaml
---

A sticky one-line ticker (36px) of seven live indices (NIFTY 50, NIFTY NEXT 50,
BANK NIFTY, FIN NIFTY, MIDCAP 100, NIFTY IT, INDIA VIX) rendered once by
`AppShell` under the top bar on every app page, above the page title. Name ·
level · change per cell, hairline dividers, content-sized; VIX tone inverted;
live via the existing quote hub. OHLC in the tooltip; drawer later.
Mockup: https://claude.ai/artifact/J6KydDSR1doqCm9h4tH5tM

Five phases in the plan; ship 0–2 as one PR:

- [x] Phase 0 — config (`exchange`, `default`, pool) and `IndexSnapshotDto`
- [x] Phase 1 — `server/index-strip.ts` + `GET /api/market/indices` (stale-serving)
- [x] Phase 2 — `IndexCard` (small), `IndexStrip`, rendered from `PageHeader`
- [x] Phase 3 — `GET /api/market/indices/live` SSE + tick flash
- [ ] Phase 4 — index drawer (chart, OHLC, `DayRange`, 52-week, constituent breadth)
- [ ] Phase 5 — per-user index selection

Phases 0–3 built 2026-09-18 — as-built: `docs/reference/market-indices-strip.md`.
R1 confirmed: the Fyers symbol layer is NSE-only, so SENSEX is out until BSE support lands (NIFTY NEXT 50 holds its slot); SMALLCAP 100 waits on ticker verification. Outbound Fyers index aliases fixed on the way (`toFyersSymbol`).
