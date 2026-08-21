-- Database-level enforcement of the invariants that matter most.
--
-- These exist because a comment in CLAUDE.md cannot stop an UPDATE, and the
-- failure modes they prevent are silent: a mutated candle or a rewritten
-- strategy version corrupts history without raising anything.

-- Hard rule 5: price history is append-only. Corrections are corporate_actions
-- rows applied on read, never an UPDATE. DELETE stays allowed so a bad
-- ingestion run can be rolled back wholesale.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only; corrections belong in corporate_actions (CLAUDE.md hard rule 5)',
    TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS daily_candles_no_update ON daily_candles;
--> statement-breakpoint
CREATE TRIGGER daily_candles_no_update
  BEFORE UPDATE ON daily_candles
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint

DROP TRIGGER IF EXISTS minute_candles_no_update ON minute_candles;
--> statement-breakpoint
CREATE TRIGGER minute_candles_no_update
  BEFORE UPDATE ON minute_candles
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint

-- Hard rule 7: a strategy version is immutable. Changing a weight mints a new
-- row; editing one in place would retroactively change what every past signal
-- claims to have been computed from.
CREATE OR REPLACE FUNCTION reject_strategy_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'strategy_versions is immutable; a config change mints a new row (CLAUDE.md hard rule 7)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS strategy_versions_no_update ON strategy_versions;
--> statement-breakpoint
CREATE TRIGGER strategy_versions_no_update
  BEFORE UPDATE ON strategy_versions
  FOR EACH ROW EXECUTE FUNCTION reject_strategy_mutation();
--> statement-breakpoint

-- Hard rule 3: prices are integer paise. Integer columns already prevent
-- floats; these catch the other half — a negative or nonsensical price.
ALTER TABLE daily_candles
  ADD CONSTRAINT daily_candles_prices_positive
  CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0 AND volume >= 0);
--> statement-breakpoint

ALTER TABLE daily_candles
  ADD CONSTRAINT daily_candles_range_coherent
  CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close);
--> statement-breakpoint

ALTER TABLE minute_candles
  ADD CONSTRAINT minute_candles_prices_positive
  CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0 AND volume >= 0);
--> statement-breakpoint

ALTER TABLE minute_candles
  ADD CONSTRAINT minute_candles_range_coherent
  CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close);
--> statement-breakpoint

-- A signal's strength is a 0-100 score and its bias a signed unit interval.
-- Anything outside those ranges means the engine's mapping broke.
ALTER TABLE signals
  ADD CONSTRAINT signals_strength_range CHECK (strength BETWEEN 0 AND 100);
--> statement-breakpoint

ALTER TABLE signals
  ADD CONSTRAINT signals_bias_range CHECK (bias BETWEEN -1 AND 1);
--> statement-breakpoint

ALTER TABLE signal_factors
  ADD CONSTRAINT signal_factors_score_range CHECK (score BETWEEN -1 AND 1);
--> statement-breakpoint

-- An adjustment factor of zero would zero out every historical price.
ALTER TABLE corporate_actions
  ADD CONSTRAINT corporate_actions_ratio_positive CHECK (ratio > 0);
