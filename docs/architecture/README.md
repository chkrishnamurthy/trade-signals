# Architecture

How EquityWise is built — system design, the data model, and the reasoning
behind the major decisions. Read these to understand *why* the code is shaped
the way it is before changing it.

| Document | What it covers |
| --- | --- |
| [backtesting-architecture.md](backtesting-architecture.md) | **Historical proposal, never built** (2026-08-29). Live and backtest engine design for the removed signal engine; backtesting trades is outside the product since 2026-10-17 |
| [seo-architecture.md](seo-architecture.md) | **Partly aspirational.** SEO design including a public stock/screener/sector spine that was never built — every app page is private and `noindex`. The as-built rules are the `seo` skill (`.claude/skills/seo/SKILL.md`) |
| [auth-system-design.md](auth-system-design.md) | **Superseded** — the original (Better Auth) auth proposal, kept for the record; the current plan is [planning/authentication-plan.md](../planning/authentication-plan.md) |
