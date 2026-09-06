---
name: architecture-guardrails
description: The AGENTS.md "Do not" list applied product-wide — no multi-tenancy/RBAC/subscriptions, no Redis/Celery/Kubernetes/Terraform, no admin CRUD UI, no third-party indicator library, no order execution, no floating-point money. Use when a request would add a new service, a new table, a new dependency, a queue, a role system, or anything that sounds like standard SaaS infrastructure — the pattern that's normal everywhere else is exactly the one this product is deliberately not built on.
---

# architecture-guardrails

This is the backend/architecture half of the product's "do not build this" list. The UI
half — no order-shaped affordance, no holdings display, no BUY/SELL as an instruction —
lives in the `design` skill's `references/exclusions.md`. Together they cover the whole
list. Verified clean by direct grep against the repo as of 2026-08-29 (dates matter here —
re-verify before citing this as still true).

## Single-user is a valid defence; wrong math is not

Borrowing `grill-me`'s own framing: absent multi-tenancy, RBAC, and horizontal scale are
correct today, not gaps — `AGENTS.md` states this is a single-user personal tool, never
deployed publicly. That is not a licence to skip correctness, security at the data-access
level, or honest math. It is specifically a licence to *not* build the infrastructure that
those three things usually require.

## Confirmed absent, resting on convention alone (no test enforces these)

Grepped clean as of this audit — no schema table, dependency, or file suggests any of:

- **Multi-tenancy, RBAC, or a subscription/billing table** in `packages/db/src/schema/`.
- **Redis, Celery, Kubernetes, or Terraform** anywhere in the codebase (source or config).
- **An admin CRUD UI** — no `admin` route exists under `apps/web/src/app`.
- **`technicalindicators` or a similar indicator library** in any `package.json`.
- **Floating-point rupees** — no variable typed as rupees-as-`number` found in
  `packages/core`/`packages/shared`.

None of these five has an automated test the way the provider boundary does (below) — a
future PR could introduce any of them without anything failing. If a request would add one
of these, that's a AGENTS.md-level architecture decision for the user to make explicitly,
not something to build because it's the standard pattern for the general problem being
solved. Report what's being asked for and what rule it touches, then stop.

## Confirmed enforced — a real test, not just a convention

`packages/market-data/src/__tests__/boundary.test.ts` (already cited by the
`provider-boundary` skill for the Fyers-symbol half) has a **second, separate assertion**
in the same file worth knowing about explicitly:

```
it('no order-execution vocabulary exists anywhere', () => {
  const found = grep('placeOrder|cancelOrder|modifyOrder|orderBook|/positions|/holdings|/funds');
  expect(found).toEqual([]);
});
```

This greps all product `.ts`/`.tsx` code (excluding comments and test files) for exactly
those terms. It is the one item on this whole list with automated enforcement — a stray
`placeOrder` function or a `/positions` route will fail CI, not just a review. This is
also why the phrase "not even read-only" in AGENTS.md's ban on order execution is literal:
the test doesn't distinguish read from write, `/positions` alone fails it.

## Config over admin UI

AGENTS.md's "config is versioned YAML" rule (rule 7, plus the explicit "do not build an
admin CRUD UI") means a request for "a settings page to edit strategy weights" or "a UI to
manage the instrument universe" should become a `config/*.yaml` change plus a new
`strategy_versions` row (see the `worker` skill), not a form backed by a database table.
If the request is specifically for something only an admin screen can reasonably do
(inspecting current config, not editing it), a read-only view is fine — the ban is on
CRUD, not on visibility.

## On finding a request that would violate this list

Same doctrine as every other skill here: name the specific rule, name the file/pattern
that would introduce the violation, and stop. Whether to renegotiate the rule (the founder
roadmap in memory `founder-roadmap-tension` does eventually call for some of these) is the
user's call, made deliberately — not something to infer from a feature request that merely
resembles what those items would solve.
