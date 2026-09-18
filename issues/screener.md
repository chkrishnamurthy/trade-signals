---
id: EW-102
title: Screener
type: feature
stage: ideas
priority: high
area: [web]
created: 2026-08-24
updated: 2026-09-06
stage_since: 2026-09-06
tier: "1.2"
source: docs/planning/pending-features.md
---

**What exists.** A complete screener backend: `ScreenerFilter`, `ScreenerSort`,
`ScreenerQuery`, `ScreenerRow` and the `screen()` query builder
(`packages/db/src/repositories/indicators.ts:116-293`), covering price ranges,
percent-move ranges, above/below each EMA, and EMA stack alignment.

**What is missing.** No API route, no page, no caller of any kind. The nav
already declares it (`apps/web/src/lib/navigation.ts`, "Screener — Multi-condition
technical filters", `status: 'planned'`).

**Done when.** `GET /api/screener` with a Zod-validated query, and a `/screener`
page reusing `stocks-table.tsx`. The filter vocabulary must stay technical per
the BUY/SELL rule — "above 200 EMA", never "buy candidates".