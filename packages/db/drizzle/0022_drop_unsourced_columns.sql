-- Hand-written. Two things, both cleanup after the watchlist column registry
-- stopped declaring columns this application has no data source for.
--
-- History: written as 0019 but never added to meta/_journal.json, so it never
-- ran (found during the paper-trading audit, 2026-09-17). Renumbered 0022 and
-- journaled; the SQL is unchanged and idempotent (IF EXISTS, no-op UPDATEs).
--
-- 1. `intraday_signals` was the last table of the removed intraday engine
--    (its factors/reasons/events/runs went in 0012). Nothing writes it and the
--    one reader — the watchlist's live-setup columns — is gone with this change.
--
-- 2. Stored layouts and saved views may still name the removed column ids.
--    The renderer already drops unknown ids on read, so this is not a
--    correctness fix; it stops a saved view from carrying a sort rule or a
--    range filter on a column that no longer exists, which would otherwise
--    surface as a removable chip the user never set.

DROP TABLE IF EXISTS intraday_signals CASCADE;
--> statement-breakpoint

CREATE TEMP TABLE removed_watchlist_columns (id text PRIMARY KEY);
--> statement-breakpoint
INSERT INTO removed_watchlist_columns (id) VALUES
  ('upperCircuit'), ('lowerCircuit'), ('deliveryPercent'),
  ('marketCap'), ('peRatio'), ('forwardPeRatio'), ('pbRatio'), ('pegRatio'),
  ('evEbitda'), ('dividendYield'), ('eps'), ('epsGrowth'), ('revenue'),
  ('revenueGrowth'), ('profitGrowth'), ('roe'), ('roce'), ('debtToEquity'),
  ('promoterHolding'), ('promoterPledge'),
  ('sma100'), ('sma200'), ('adx14'), ('stochastic'), ('bollingerBands'),
  ('momentum'), ('setupState'), ('setupScore'), ('entryZone'), ('setupTarget'),
  ('setupInvalidation'), ('setupRiskReward'), ('support'), ('resistance');
--> statement-breakpoint

-- Visible columns (text[]), in both tables.
UPDATE watchlist_layouts l
SET columns = COALESCE(
  (SELECT array_agg(c ORDER BY ord)
     FROM unnest(l.columns) WITH ORDINALITY AS u(c, ord)
    WHERE c NOT IN (SELECT id FROM removed_watchlist_columns)),
  ARRAY[]::text[])
WHERE l.columns && (SELECT array_agg(id) FROM removed_watchlist_columns);
--> statement-breakpoint
UPDATE watchlist_views v
SET columns = COALESCE(
  (SELECT array_agg(c ORDER BY ord)
     FROM unnest(v.columns) WITH ORDINALITY AS u(c, ord)
    WHERE c NOT IN (SELECT id FROM removed_watchlist_columns)),
  ARRAY[]::text[])
WHERE v.columns && (SELECT array_agg(id) FROM removed_watchlist_columns);
--> statement-breakpoint

-- Sort rules (jsonb array of { columnId, direction }).
UPDATE watchlist_layouts l
SET sort = COALESCE(
  (SELECT jsonb_agg(rule ORDER BY ord)
     FROM jsonb_array_elements(l.sort) WITH ORDINALITY AS r(rule, ord)
    WHERE rule->>'columnId' NOT IN (SELECT id FROM removed_watchlist_columns)),
  '[]'::jsonb)
WHERE jsonb_typeof(l.sort) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.sort) r(rule)
               WHERE rule->>'columnId' IN (SELECT id FROM removed_watchlist_columns));
--> statement-breakpoint
UPDATE watchlist_views v
SET sort = COALESCE(
  (SELECT jsonb_agg(rule ORDER BY ord)
     FROM jsonb_array_elements(v.sort) WITH ORDINALITY AS r(rule, ord)
    WHERE rule->>'columnId' NOT IN (SELECT id FROM removed_watchlist_columns)),
  '[]'::jsonb)
WHERE jsonb_typeof(v.sort) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.sort) r(rule)
               WHERE rule->>'columnId' IN (SELECT id FROM removed_watchlist_columns));
--> statement-breakpoint

-- Range filters (jsonb object keyed by column id under `ranges`).
UPDATE watchlist_layouts l
SET filters = l.filters - 'ranges' || jsonb_build_object('ranges',
  COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(l.filters->'ranges')
             WHERE key NOT IN (SELECT id FROM removed_watchlist_columns)), '{}'::jsonb))
WHERE jsonb_typeof(l.filters->'ranges') = 'object'
  AND l.filters->'ranges' ?| (SELECT array_agg(id) FROM removed_watchlist_columns);
--> statement-breakpoint
UPDATE watchlist_views v
SET filters = v.filters - 'ranges' || jsonb_build_object('ranges',
  COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(v.filters->'ranges')
             WHERE key NOT IN (SELECT id FROM removed_watchlist_columns)), '{}'::jsonb))
WHERE jsonb_typeof(v.filters->'ranges') = 'object'
  AND v.filters->'ranges' ?| (SELECT array_agg(id) FROM removed_watchlist_columns);
--> statement-breakpoint

-- Quick views that existed only for the removed columns.
UPDATE watchlist_layouts
SET quick_view = NULL
WHERE quick_view IN ('live_setups', 'high_dividend', 'valuation');
--> statement-breakpoint

DROP TABLE removed_watchlist_columns;
