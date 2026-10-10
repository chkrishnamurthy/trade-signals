# Market Brief

`/today` is the signed-in home page and the single market-condition surface. It combines the former Daily Market Brief and Market Breadth page into one progressive read: market state first, personal relevance second, supporting breadth evidence next, and stock-level activity last.

The old `/markets/breadth` URL is retained only as an authenticated compatibility redirect. It preserves `?u=nifty500` and sends the user to `/today`; it has no page component, loading UI, or independent data contract.

## Information hierarchy

1. **Market at a glance** — deterministic breadth label and evidence sentence, benchmark return, advances/declines, stocks above the 20- and 200-day EMAs, and 52-week highs/lows.
2. **Your stocks today** — the signed-in user's watchlist movers merged with meaningful watchlist change events. A symbol appears once even when several inputs mention it.
3. **Participation over time** — one-year percentage above the 200-day EMA and 60-session 52-week highs versus lows.
4. **Industry leadership and weakness** — leading and weakening industries over 1D, 1W, 1M, or 3M, plus the complete table on demand.
5. **Stocks worth a closer look** — non-empty tabs for unusual volume, delivery spikes, 52-week highs, 52-week lows, and long build-up. These are measured conditions, not recommendations.
6. **Strategy research** — admin-only daily signal research with persisted factor explanations. It is absent, rather than zero-filled, for regular users.

This order answers “what is happening?” before asking the user to inspect individual names. Dense supporting detail is lower on the page or behind an explicit disclosure.

## Universes and navigation

The universe selector has two values:

| UI | URL | Server value |
| --- | --- | --- |
| All NSE | `/today` | `all` |
| Nifty 500 | `/today?u=nifty500` | `nifty500` |

Unknown, empty, or array-valued `u` parameters resolve to `all`. Every screener link preserves the selected universe where the screener supports it. Industry queries use the selected universe for their result scope.

Market Brief is a primary navigation destination. Market Breadth is not listed separately in desktop navigation, the mobile More menu, or public navigation.

## Data and freshness

`apps/web/src/server/market-brief.ts` composes the response after authenticating the current user. It reads persisted end-of-day indicators, signals, signal factors, watchlist membership, index data, and the breadth snapshot. `apps/web/src/server/market-breadth.ts` reads the market-wide history, industry aggregates, activity counts, and leaders.

The request path does not call a market-data provider and does not recompute indicators or signals. Prices remain integer paise. The page describes a completed trading session and displays its session date, snapshot build time, and Complete/Stale/Unavailable state.

`buildBreadthMarketRead()` is role-independent. It uses advances versus declines, percentages above the 20-, 50-, and 200-day EMAs, and the balance of new highs versus lows. It emits one of `bullish`, `bearish`, `mixed`, `transitional`, or `insufficient_data` plus a sentence naming the evidence. It does not expose a confidence score.

## Privacy and roles

- Watchlist reads are scoped to the authenticated owner in the repository layer.
- Regular users receive `signalsIncluded: false`; no strategy-derived counts or rows are shown.
- Admins receive the same market-wide classification plus the Strategy research section. Role never changes the market condition.
- Stock activity uses technical language and links to research pages or pre-filled screener results. It does not place or imply an order.

## Main code paths

| Responsibility | Location |
| --- | --- |
| Route and metadata | `apps/web/src/app/today/page.tsx` |
| Legacy redirect | `apps/web/src/app/markets/breadth/page.tsx` |
| Unified page | `apps/web/src/components/market-brief/market-brief-view.tsx` |
| Reusable breadth charts | `apps/web/src/components/market-brief/breadth-charts.tsx` |
| Pure UI ranking/merging rules | `apps/web/src/components/market-brief/view-model.ts` |
| Pure market classification | `apps/web/src/lib/market-brief/breadth-summary.ts` |
| Query/redirect normalization | `apps/web/src/lib/market-brief/routes.ts` |
| Per-user composition service | `apps/web/src/server/market-brief.ts` |
| Persisted breadth reader | `apps/web/src/server/market-breadth.ts` |

## Verification

- Pure tests cover universe normalization, legacy redirect targets, industry ranking, personal-item merging, activity-category visibility, regular-user/admin market-condition identity, and classification fixtures captured from completed All NSE and Nifty 500 sessions.
- `market-brief-view.stories.tsx` covers desktop and 375px regular-user views, admin visibility, universe links, timeframe switching, 52-week-low tab switching, horizontal overflow, and automated accessibility scanning.
- Production verification after deployment must check `/today`, `/today?u=nifty500`, and the authenticated `/markets/breadth?u=nifty500` redirect.
