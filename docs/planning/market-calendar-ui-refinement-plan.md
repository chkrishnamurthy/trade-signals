---
name: Market Calendar UI refinement
status: done
horizon: now
created: 2026-10-02
updated: 2026-10-02
area: [web]
confidence: 3
summary: Month-first calendar navigation, honest date-only timing language, and a polished responsive event-card experience.
owner: krishna
---

# Market Calendar UI refinement

**Status:** implemented · **Date:** 2026-10-02

This refinement improves the existing `/calendar` presentation and default date range.
It does not add a live corporate-event source. The current data coverage remains NSE
holidays plus explicitly verified events from `config/market-calendar.yaml`; source
ingestion is a separate follow-up scope.

## 1. Confirmed decisions

1. **This Month is the default range.** Opening `/calendar` without a `range` parameter
   shows the current IST calendar month.
2. **An absent time is not treated as an error.** Many corporate events are published
   with a date but no exact time. The interface explains this calmly and never invents
   an intraday time.
3. **Event cards become the primary visual unit.** The result should be easier to scan,
   more inviting on mobile, and consistent with EquityWise's existing semantic design
   system.
4. **No new raw colours, radii, shadows, or global tokens.** The work uses existing
   `surface`, `muted`, `primary`, `warning`, `neutral`, border, badge, typography, and
   shadow primitives.

## 2. Default-range behavior

### Page URL

- No `range` parameter means `month`.
- `range=today` means the current IST date.
- `range=week` means the current IST Monday–Sunday window.
- `range=month` remains accepted for existing/shared links, but selecting the default
  month control removes the redundant parameter from the URL.
- Event type and watchlist filters remain unchanged when the user changes the period.

### API consistency

`GET /api/market-calendar` with no `from`/`to` parameters also defaults to the current
IST month. This keeps direct API usage consistent with the page. Explicit `from` and
`to` continue to take precedence.

### Tests

- Page parsing defaults to `month`.
- The service/API default uses the first and final calendar days in IST.
- Month/year boundaries remain timezone-independent.
- Range navigation produces stable, shareable URLs.

## 3. Date-only and timed-event language

`event_time = null` means the source supplied a calendar date without a precise time.
It does not mean ingestion failed.

### Event-card treatment

- Timed event: show the formatted time, for example `9:30 AM IST`.
- Market holiday: show `Market closed` rather than a missing-time message.
- Other date-only event: show `Time not published` in secondary metadata.
- Do not reserve a large time column for date-only events.

### Detail treatment

- Rename the definition from `Event time` to `Timing`.
- Timed event: formatted IST value.
- Market holiday: `Market closed for the regular equity session.`
- Other date-only event: `Exact timing has not been published by the source.`
- Keep the original source and link beside this information so the user can verify an
  update.

### Data contract

The database and API remain unchanged: `eventTime` stays nullable. Presentation helpers
derive the display copy from `eventType` and `eventTime`, with pure unit tests for all
three states.

## 4. Visual hierarchy

### 4.1 Header and coverage context

- Retain the current title and subtitle.
- Add a small factual coverage line near the filters: the calendar contains stored,
  source-attributed events and may be partial.
- Do not label the feed live or comprehensive.

### 4.2 Summary cards

Retain the four agreed metrics, but improve their scan hierarchy:

- compact semantic icon tile in the top-right;
- larger tabular count with more whitespace;
- concise supporting period copy;
- consistent card height and a subtle hover/focus treatment only if the cards become
  interactive later. In this phase they remain informational.

The cards continue to use `MetricCard`; no one-off card system is introduced.

### 4.3 Filter panel

- Use a raised, clearly bounded filter surface.
- Make Today / This Week / This Month a full-width segmented control on small screens
  and a compact control on larger screens.
- Give the active period stronger surface/foreground contrast and `aria-pressed`.
- Keep the event-type selector and Watchlist Only switch aligned and comfortably sized.
- Add `Clear filters` only when event type or watchlist filtering is active; clearing
  returns to the default month without removing unrelated navigation state.
- Keep the no-watchlist explanation directly below the disabled switch.

### 4.4 Date groups

- Use a compact date marker containing weekday, day, and month, followed by the event
  count.
- Preserve real headings and `aria-labelledby` relationships.
- Separate groups with spacing and borders rather than heavy decoration.

### 4.5 Event cards

Each event is one full-width keyboard-accessible card containing:

1. an event-type icon tile using existing semantic surfaces;
2. event-type badge and optional importance badge;
3. event title as the dominant line;
4. symbol and company name when present;
5. one short explanation, with graceful missing-copy fallback;
6. a metadata footer with timing, source, and a `View details` affordance;
7. an explicit star plus text for watchlist relevance.

Watchlist events use a primary-tinted border/surface plus the text marker, so colour is
never the only distinction. Cards use `surface`, `border`, `shadow-subtle`, and existing
badge variants; no event type receives an invented raw colour.

### 4.6 Detail sheet

- Lead with the event title, event icon/type, company identity, date, and timing.
- Place explanation, Why this matters, What to watch, and Source in clearly separated
  surface sections rather than an undifferentiated text stack.
- Keep source provenance visible and the external source control unambiguous.
- Preserve the exact informational disclaimer.
- Continue using the accessible Radix-backed Sheet: full-width on small screens and a
  right-hand drawer on larger screens.

## 5. Responsive and accessibility requirements

- No horizontal scrolling at 320px width.
- Touch targets remain at least the existing control size.
- Card activation works with pointer, Enter, and Space through a native button.
- Focus remains visible through the global focus treatment.
- Badges, icons, and tinted surfaces always have accompanying text.
- Long company names, titles, source names, and descriptions wrap without overlapping
  controls.
- Reduced-motion behavior remains inherited from the existing Sheet and component
  primitives.

## 6. Loading, empty, and partial-data states

- Loading skeletons mirror the final summary, filters, date marker, and card structure.
- Empty states retain contextual copy for period, event type, and watchlist filters.
- A filtered empty state offers a clear reset control.
- Partial-source copy remains factual; the interface never implies exhaustive NSE
  coverage.

## 7. Expected file changes

```text
packages/shared/src/market-calendar.ts
packages/shared/src/market-calendar.test.ts

apps/web/src/app/calendar/page.tsx
apps/web/src/app/calendar/loading.tsx
apps/web/src/components/calendar/calendar-view.tsx
apps/web/src/components/calendar/calendar-view.test.ts
apps/web/src/server/market-calendar.ts
apps/web/src/server/market-calendar-schemas.test.ts

docs/reference/market-calendar.md
```

No migration, new table, new dependency, new design token, or provider call is required.

## 8. Implementation sequence

1. Change shared/page/server default-range semantics to month and update tests.
2. Introduce pure timing-label helpers and replace `Time not specified` everywhere.
3. Refine summary and filter layouts using existing primitives.
4. Rebuild date groups and event cards with the new visual hierarchy.
5. Refine the detail sheet and source presentation.
6. Match loading and empty states to the finished layout.
7. Verify keyboard behavior, mobile wrapping, light/dark themes, typecheck, tests,
   feature lint, and production build.

## 9. Acceptance checks

- `/calendar` opens on This Month with no query parameter.
- The current month shows all stored events for that month.
- No visible copy says `Time not specified`.
- Date-only events explain that timing was not published; holidays say the market is
  closed.
- Cards are easy to scan and remain clear at phone and desktop widths.
- Watchlist events are identifiable without relying on colour.
- Source provenance and the informational disclaimer remain visible.
- Empty/loading/error states match the refreshed page.
- No execution, brokerage, prediction, or advisory language is introduced.
- Typecheck, tests, feature lint, and production build pass.
