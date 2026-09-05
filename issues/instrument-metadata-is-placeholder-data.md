---
title: Instrument metadata is placeholder data
type: issue
status: backlog
priority: medium
tier: "2.2"
source: docs/planning/pending-features.md
---

`ensureInstruments` (`packages/db/src/repositories/instruments.ts:115`) inserts
every instrument with `lotSize: 1`, `tickSize: 5`, `isin: null` and
`providerRef: null`, with the comment "a placeholder until the universe sync
supplies the real increment." The real sync, `syncInstruments`
(`:43`), has **no caller**.

Tick size matters here specifically because break buffers and proximity checks in
the intraday engine are computed in paise; a wrong increment quietly rounds
levels onto prices that cannot trade.

**Done when.** A worker job calls `syncInstruments` from the provider's
instrument master, and `ensureInstruments` stops inventing values.