# Skills

Guardrails for the parts of this repo where being wrong is expensive and silent.

## User-invoked

You type these. The agent never fires them on its own, so this list is the index.

- [grill-me](grill-me/SKILL.md) — hostile production-readiness review of the whole repo,
  scored across ten categories, followed by a question-by-question interrogation.
  `/grill-me [junior|mid|senior|staff|principal|incident] [area]`

## Model-invoked

The agent reaches for these on its own when a task fits, and they call each other.
Each one reports and stops on a violation; the fix is the author's call.

- [signal-invariants](signal-invariants/SKILL.md) — the eight hard rules and the mechanism
  enforcing each. Some are DB triggers; three rest on convention. The shared reference the
  others cite.
- [indicator-math](indicator-math/SKILL.md) — warm-up indices, Wilder versus `2/(period+1)`,
  null propagation, and fixture provenance. Fires on indicator and indicator-test work.
- [closed-candles](closed-candles/SKILL.md) — lookahead guard for the signal engine,
  backtests, and bar fetches. Fires on `includeForming`, bar indexing, and fill prices.
- [provider-boundary](provider-boundary/SKILL.md) — keeps Fyers types behind the adapter.
  Backed by a real test at `packages/market-data/src/__tests__/boundary.test.ts`.

## Conventions

- A skill states what it cannot be looked up. The tree, the scripts, and the config are
  their own source of truth, so no skill caches a file listing. Derive it with `git ls-files`.
- Every claim in a skill is checkable against the repo today. A stale path in a skill becomes
  a fabricated finding in a review.
- User-invoked skills carry `disable-model-invocation: true` and a one-line human-facing
  description. Model-invoked skills carry a description written to trigger on real branches,
  and pay for it in permanent context on every turn.
- `agents/openai.yaml` beside each `SKILL.md` mirrors the same choice for Codex.
  A skill is user-invoked in both harnesses or in neither.
