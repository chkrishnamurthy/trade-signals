# Planning

Where the product is going — the backlog, the roadmap, and design plans for work
that is proposed or in progress but not yet built.

| Document | What it covers |
| --- | --- |
| [pending-features.md](pending-features.md) | The authoritative backlog — what is built, built-but-unwired, and declared-but-absent, ordered by cost-to-value |
| [announcement-interpretation-sources.md](announcement-interpretation-sources.md) | Announcement interpretation feasibility: best free sources, FYERS capabilities, reuse rights, existing implementation gaps and staged delivery |
| [signals-page-plan.md](signals-page-plan.md) | **Superseded 2026-09-17** by the intraday strategy plan below. Design history of the removed `/signals` page (Confirmed VWAP Trend Pullback) |
| [authentication-plan.md](authentication-plan.md) | First-party **multi-user** authentication architecture (self-hosted, per-user isolation, Resend email) — supersedes the Better Auth plan |
| [market-data-scaling-plan.md](market-data-scaling-plan.md) | Serving many users from one Fyers account — the fan-in plan (users read from our DB; only the worker calls Fyers). To be done after auth, before public traffic |
| [upstox-provider-plan.md](upstox-provider-plan.md) | Plan for adding Upstox as a second market-data provider behind the provider boundary |
| [dhan-provider-plan.md](dhan-provider-plan.md) | Dhan vs Fyers research (pricing, limits, auth, history), the run-both-route-by-strength verdict, and the phased migration plan — 2026-09-16 |
| [intraday-strategy-dhan-plan.md](intraday-strategy-dhan-plan.md) | Replace `/signals` with one rule-based intraday strategy (ORB with VWAP + volume confirmation) on Dhan data — numeric rules, page redesign, paper-trading path, replay/backtest, phases — 2026-09-17 |
| [storybook-plan.md](storybook-plan.md) | Plan for introducing Storybook for the web component library |
