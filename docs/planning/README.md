# Planning

Where the product is going — the backlog, the roadmap, and design plans for work
that is proposed or in progress but not yet built.

| Document | What it covers |
| --- | --- |
| [pending-features.md](pending-features.md) | The authoritative backlog — what is built, built-but-unwired, and declared-but-absent, ordered by cost-to-value |
| [announcement-interpretation-sources.md](announcement-interpretation-sources.md) | Announcement interpretation feasibility: best free sources, FYERS capabilities, reuse rights, existing implementation gaps and staged delivery |
| [company-research-implementation-plan.md](company-research-implementation-plan.md) | **Ready for decisions, 2026-10-03 (rev 2).** Full-market screener + `/stocks/[symbol]` company research: repository audit, provider/licensing research, explicit list of what is not possible, technical-screener-first roadmap, fundamentals spike (Upstox / XBRL / vendor). Supersedes stock-research-platform-plan.md |
| [screener-dhan-fyers-plan.md](screener-dhan-fyers-plan.md) | **Implemented, updated 2026-10-10.** V1 screener (~2,000 NSE stocks), `/stocks/[symbol]`, and market breadth inside `/today`, built only from provider-normalised and first-party persisted data — metric catalogue, UI/UX, data model, jobs, phases, mockups. Fundamentals stay in the company-research plan |
| [stock-header-redesign-plan.md](stock-header-redesign-plan.md) | **Built 2026-10-04 (R1–R4).** screener.in-style company introduction card for `/stocks/[symbol]` — header and identifier chips, customisable 18-ratio grid (add/edit, saved per user), Profile and computed Key points, CSV export; field-by-field map of what our data can and cannot fill |
| [signals-page-plan.md](signals-page-plan.md) | **Superseded 2026-09-17** by the intraday strategy plan below. Design history of the removed `/signals` page (Confirmed VWAP Trend Pullback) |
| [authentication-plan.md](authentication-plan.md) | First-party **multi-user** authentication architecture (self-hosted, per-user isolation, Resend email) — supersedes the Better Auth plan |
| [market-data-scaling-plan.md](market-data-scaling-plan.md) | Serving many users from one Fyers account — the fan-in plan (users read from our DB; only the worker calls Fyers). To be done after auth, before public traffic |
| [upstox-provider-plan.md](upstox-provider-plan.md) | Plan for adding Upstox as a second market-data provider behind the provider boundary |
| [dhan-provider-plan.md](dhan-provider-plan.md) | Dhan vs Fyers research (pricing, limits, auth, history), the run-both-route-by-strength verdict, and the phased migration plan — 2026-09-16 |
| [intraday-strategy-dhan-plan.md](intraday-strategy-dhan-plan.md) | Replace `/signals` with one rule-based intraday strategy (ORB with VWAP + volume confirmation) on Dhan data — numeric rules, page redesign, paper-trading path, replay/backtest, phases — 2026-09-17. **`/intraday` is admin-only since 2026-09-18** |
| [paper-trading-plan.md](paper-trading-plan.md) | Per-user intraday paper trading (₹2,00,000 virtual portfolios, shared-capital allocation, ledger, Dhan feed, square-off, `/paper-trading` page) — findings, architecture, DB/API/worker design and phases 0–6 — 2026-09-17. **Built (PR #23); `/paper-trading` is admin-only since 2026-09-18** |
| [finmagine-competitive-analysis.md](finmagine-competitive-analysis.md) | FinMagine vs EquityWise competitive analysis — feature inventory, UX, gaps by tier, recommendations, 4-phase roadmap and horizon-segmented nav — 2026-09-17 |
| [market-indices-strip-plan.md](market-indices-strip-plan.md) | Sticky one-line ticker of seven live indices under the top bar on every app page — snapshot + SSE APIs on the existing quote hub, index drawer, per-user selection, five phases — 2026-09-18. **Phases 0–3 built** (see `reference/market-indices-strip.md`); drawer and per-user selection open |
| [ipos-plan.md](ipos-plan.md) | `/ipos` for Indian IPOs (mainboard + SME): facts from NSE's official IPO JSON and bhavcopy, GMP (labelled unofficial) from InvestorGain, open to every user at launch — source research, schema, worker jobs, API, UI, compliance and phases 0–11 — 2026-10-02. **Built and merged 2026-10-02** |
| [market-calendar-plan.md](market-calendar-plan.md) | Authenticated `/calendar` implementation — NSE holidays, results, corporate actions and other events, with IST ranges, watchlist relevance, provenance, and idempotent YAML-backed sync — **built 2026-10-02** |
| [market-calendar-ui-refinement-plan.md](market-calendar-ui-refinement-plan.md) | Month-first defaults, honest date-only timing language, and a polished responsive event-card experience for `/calendar` — ready for implementation, 2026-10-02 |
| [storybook-plan.md](storybook-plan.md) | Plan for introducing Storybook for the web component library |
