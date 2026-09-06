# Planning

Where the product is going — the backlog, the roadmap, and design plans for work
that is proposed or in progress but not yet built.

| Document | What it covers |
| --- | --- |
| [pending-features.md](pending-features.md) | The authoritative backlog — what is built, built-but-unwired, and declared-but-absent, ordered by cost-to-value |
| [authentication-plan.md](authentication-plan.md) | First-party **multi-user** authentication architecture (self-hosted, per-user isolation, Resend email) — supersedes the Better Auth plan |
| [market-data-scaling-plan.md](market-data-scaling-plan.md) | Serving many users from one Fyers account — the fan-in plan (users read from our DB; only the worker calls Fyers). To be done after auth, before public traffic |
| [upstox-provider-plan.md](upstox-provider-plan.md) | Plan for adding Upstox as a second market-data provider behind the provider boundary |
| [storybook-plan.md](storybook-plan.md) | Plan for introducing Storybook for the web component library |
